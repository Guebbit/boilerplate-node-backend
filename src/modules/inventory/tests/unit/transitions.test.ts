/**
 * @module
 * Transition table tests — pure, no mocks or database. What's asserted isn't "the function
 * returns what it returns" but three invariants: only a receipt or adjustment changes how many
 * units exist, a commit moves both counters equally so a sale doesn't change availability, and
 * reserve/release-expire are exact inverses. A test that merely restated the table would pass
 * against a table copied wrong.
 */

import { StockMovementReason } from '@types';
import { counterDeltaFor, availabilityOf } from '../../domain';

const EVERY_REASON = Object.values(StockMovementReason);

describe('counterDeltaFor', () => {
    it('covers every reason the contract declares', () => {
        // Not a formality: `counterDeltaFor` switches exhaustively, so a reason added to the
        // contract and not to the table is a compile error — but only if something calls it with
        // that reason, which is what this does.
        for (const reason of EVERY_REASON)
            expect(counterDeltaFor(reason, 1)).toEqual({
                onHandDelta: expect.any(Number),
                reservedDelta: expect.any(Number)
            });
    });

    // `openapi.yaml:162-171`'s literal signed table (E1) — the shape check above passes on any
    // pair of numbers, so this pins the actual value each reason produces.
    it.each([
        [StockMovementReason.reserve, { onHandDelta: 0, reservedDelta: 3 }],
        [StockMovementReason.commit, { onHandDelta: -3, reservedDelta: -3 }],
        [StockMovementReason.release, { onHandDelta: 0, reservedDelta: -3 }],
        [StockMovementReason.expire, { onHandDelta: 0, reservedDelta: -3 }],
        [StockMovementReason.receive, { onHandDelta: 3, reservedDelta: 0 }],
        [StockMovementReason.adjust, { onHandDelta: 3, reservedDelta: 0 }]
    ])('gives %s the contract-documented signed delta', (reason, expected) => {
        expect(counterDeltaFor(reason, 3)).toEqual(expected);
    });

    it('lets only a receipt or an adjustment change how many units exist', () => {
        const changesOnHand = EVERY_REASON.filter(
            (reason) => counterDeltaFor(reason, 5).onHandDelta !== 0
        );

        // `commit` is here too, and that is correct — a sale removes units. The point of the
        // assertion is that nothing a CUSTOMER does before paying appears in this list.
        expect(changesOnHand.toSorted()).toEqual(
            [
                StockMovementReason.commit,
                StockMovementReason.receive,
                StockMovementReason.adjust
            ].toSorted()
        );
    });

    it('commits without changing availability', () => {
        const { onHandDelta, reservedDelta } = counterDeltaFor(StockMovementReason.commit, 7);

        // Both columns fall together, so `onHand - reserved` is untouched: the units stopped
        // being sellable when they were reserved, and this is only the moment they leave.
        expect(onHandDelta).toBe(reservedDelta);
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
            reservedDelta: 0
        });
        expect(counterDeltaFor(StockMovementReason.adjust, 3)).toEqual({
            onHandDelta: 3,
            reservedDelta: 0
        });
    });
});

describe('availabilityOf', () => {
    it.each([
        [{ onHand: 10, reserved: 0 }, 10],
        [{ onHand: 10, reserved: 4 }, 6],
        [{ onHand: 10, reserved: 10 }, 0],
        // Absent counters read as nothing to sell, not as unlimited — the safe direction for a
        // number that decides whether to take someone's money.
        [{}, 0],
        [{ onHand: 5 }, 5],
        [{ reserved: 5 }, 0]
    ])('reads %j as %i', (counters, expected) => {
        expect(availabilityOf(counters)).toBe(expected);
    });

    it('clamps a would-be negative at zero', () => {
        // Should be unreachable — every transition guards against it — but a negative count must
        // never reach a screen, so the clamp is asserted rather than assumed.
        expect(availabilityOf({ onHand: 3, reserved: 8 })).toBe(0);
    });
});
