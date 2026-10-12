/**
 * @module
 * Transition table tests — pure, no mocks or database. What's asserted isn't "the function
 * returns what it returns" but three invariants: only a receipt or adjustment changes how many
 * units exist, a commit moves both counters equally so a sale doesn't change availability, and
 * reserve/release-expire are exact inverses. A test that merely restated the table would pass
 * against a table copied wrong.
 */

import { StockMovementReason } from '@types';
import { counterDeltaFor } from '../../domain';

const EVERY_REASON = Object.values(StockMovementReason);

describe('counterDeltaFor', () => {
    it('covers every reason the contract declares', () => {
        // Not a formality: `counterDeltaFor` switches exhaustively, so a reason added to the
        // contract and not to the table is a compile error — but only if something calls it with
        // that reason, which is what this does.
        for (const reason of EVERY_REASON)
            expect(counterDeltaFor(reason, 1)).toEqual({
                onHandDelta: expect.any(Number),
                reservedDelta: expect.any(Number),
                preorderedDelta: expect.any(Number)
            });
    });

    // `openapi.yaml`'s literal signed table — the shape check above passes on any
    // pair of numbers, so this pins the actual value each reason produces.
    it.each([
        [StockMovementReason.reserve, { onHandDelta: 0, reservedDelta: 3, preorderedDelta: 0 }],
        [StockMovementReason.ship, { onHandDelta: -3, reservedDelta: -3, preorderedDelta: 0 }],
        [StockMovementReason.release, { onHandDelta: 0, reservedDelta: -3, preorderedDelta: 0 }],
        [StockMovementReason.expire, { onHandDelta: 0, reservedDelta: -3, preorderedDelta: 0 }],
        [StockMovementReason.receive, { onHandDelta: 3, reservedDelta: 0, preorderedDelta: 0 }],
        [StockMovementReason.adjust, { onHandDelta: 3, reservedDelta: 0, preorderedDelta: 0 }],
        [StockMovementReason.restock, { onHandDelta: 3, reservedDelta: 0, preorderedDelta: 0 }],
        [StockMovementReason.preorder, { onHandDelta: 0, reservedDelta: 0, preorderedDelta: 3 }],
        [StockMovementReason.allocate, { onHandDelta: 0, reservedDelta: 3, preorderedDelta: -3 }]
    ])('gives %s the contract-documented signed delta', (reason, expected) => {
        expect(counterDeltaFor(reason, 3)).toEqual(expected);
    });

    it('lets only a shipment, a receipt, an adjustment or a restock change how many units exist', () => {
        const changesOnHand = EVERY_REASON.filter(
            (reason) => counterDeltaFor(reason, 5).onHandDelta !== 0
        );

        // `ship` is here: paying moves nothing, the units leave at dispatch.
        // Nothing a CUSTOMER does before the parcel leaves appears in this list.
        expect(changesOnHand.toSorted()).toEqual(
            [
                StockMovementReason.ship,
                StockMovementReason.receive,
                StockMovementReason.adjust,
                StockMovementReason.restock
            ].toSorted()
        );
    });

    it('ships without changing availability', () => {
        const { onHandDelta, reservedDelta } = counterDeltaFor(StockMovementReason.ship, 7);

        // Both columns fall together, so `onHand - reserved` is untouched: the units stopped
        // being sellable when they were reserved, and this is only the moment they leave.
        expect(onHandDelta).toBe(reservedDelta);
        expect(onHandDelta).toBe(-7);
        expect(onHandDelta - reservedDelta).toBe(0);
    });

    it.each([StockMovementReason.release, StockMovementReason.expire])(
        'makes %s the exact inverse of a reserve',
        (undoing) => {
            const held = counterDeltaFor(StockMovementReason.reserve, 4);
            const given = counterDeltaFor(undoing, 4);

            expect(held.onHandDelta + given.onHandDelta).toBe(0);
            expect(held.reservedDelta + given.reservedDelta).toBe(0);
        }
    );

    it('never lets a reserve or a release touch what exists', () => {
        for (const reason of [
            StockMovementReason.reserve,
            StockMovementReason.release,
            StockMovementReason.expire
        ])
            expect(counterDeltaFor(reason, 9).onHandDelta).toBe(0);
    });

    it('carries an adjustment’s sign rather than its magnitude', () => {
        // The one reason whose quantity is already signed. Shrinkage is the common case, and a
        // `Math.abs` sneaking in here would silently turn every write-off into a windfall.
        expect(counterDeltaFor(StockMovementReason.adjust, -3)).toEqual({
            onHandDelta: -3,
            reservedDelta: 0,
            preorderedDelta: 0
        });
        expect(counterDeltaFor(StockMovementReason.adjust, 3)).toEqual({
            onHandDelta: 3,
            reservedDelta: 0,
            preorderedDelta: 0
        });
    });

    it('moves only the allowance for a preorder claim, and gives it back through release or expire', () => {
        const claimed = counterDeltaFor(StockMovementReason.preorder, 4);

        for (const undoing of [StockMovementReason.release, StockMovementReason.expire]) {
            const given = counterDeltaFor(undoing, 4, 'preorder');

            // Units that never existed never touch the shelf, going or coming back.
            expect(given).toEqual({ onHandDelta: 0, reservedDelta: 0, preorderedDelta: -4 });
            expect(claimed.preorderedDelta + given.preorderedDelta).toBe(0);
        }
    });

    it('turns an allocated claim into a real hold without changing what exists', () => {
        const allocated = counterDeltaFor(StockMovementReason.allocate, 5);

        // `reserved` rises by exactly what `preordered` falls by, and the shelf count is untouched.
        expect(allocated.reservedDelta).toBe(-allocated.preorderedDelta);
        expect(allocated.onHandDelta).toBe(0);
    });
});
