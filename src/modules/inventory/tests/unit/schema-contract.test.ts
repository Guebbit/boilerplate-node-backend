/**
 * @module
 * The inventory schemas' contracts — the ledger and the hold. Both encode rules enforced by the
 * database, not by any code path: unique `orderId` makes reserving exactly-once, `status`'s
 * `held` default is what every lifecycle operation moves off of, and the ledger's two
 * zero-defaulted deltas make it replayable. Weaken any of these and no code path fails — the
 * guarantee just stops existing, silently.
 */

import { stockMovementSchema, reservationSchema, MOVEMENT_REASONS } from '@modules/inventory/model';
import { StockMovementReason } from '@types';
import {
    defaultOf,
    enumOf,
    indexBehaviour,
    indexOptionSpecs,
    indexSpecs,
    optionsOf,
    pathOptions,
    refOf,
    requiredPaths,
    subSchema,
    typeOf
} from '@tests/schema';

describe('stockMovementSchema — the ledger', () => {
    it('requires the product and the reason, and nothing else', () => {
        // A movement without a reason is an unattributable change to stock; without a product it
        // is not a movement at all. Everything else is optional because most transitions move one
        // column and originate from no human.
        expect(requiredPaths(stockMovementSchema)).toEqual(['productId', 'reason']);
    });

    it('reads its reasons off the generated contract enum', () => {
        // The reasons once had three independent declarations. Asserting against the generated
        // enum rather than a retyped list is what keeps this from becoming a fourth.
        expect(enumOf(stockMovementSchema, 'reason')).toEqual(Object.values(StockMovementReason));
        expect(MOVEMENT_REASONS).toEqual(Object.values(StockMovementReason));
    });

    it('points productId at the catalogue as a real ObjectId', () => {
        expect(typeOf(stockMovementSchema, 'productId')).toBe('ObjectId');
        expect(refOf(stockMovementSchema, 'productId')).toBe('Product');
    });

    it('defaults both deltas to zero, so a row is always summable', () => {
        // The replayability rule: summing each column over a product's rows must reproduce its
        // counter. An absent delta breaks that sum — `undefined` is not zero to `$sum`.
        expect(defaultOf(stockMovementSchema, 'onHandDelta')).toBe(0);
        expect(defaultOf(stockMovementSchema, 'reservedDelta')).toBe(0);
    });

    it('keeps timestamps, which the ledger is ordered by', () => {
        expect(optionsOf(stockMovementSchema).timestamps).toBe(true);
    });

    it('declares exactly the two documented indexes, newest-first in both', () => {
        // Both are `createdAt: -1`: the ledger is only ever read latest-first, and a `+1` here
        // would answer the same questions by sorting the whole match in memory.
        expect(indexSpecs(stockMovementSchema)).toEqual([
            'stockmovements_createdAt: createdAt-1',
            'stockmovements_productId_createdAt: productId+1, createdAt-1'
        ]);
    });
});

describe('reservationSchema — the hold', () => {
    it('makes one hold per order a database fact', () => {
        // The exactly-once primitive. Not hygiene: a retried checkout is detected by the insert
        // failing, with no read-then-write race to lose.
        expect(indexOptionSpecs(reservationSchema)).toContain('orderId_1: unique=true');
    });

    it('requires everything a hold needs to be honoured or given back', () => {
        // `items` included: a hold that cannot say what it claimed cannot be released, and the
        // units are lost until someone reconciles by hand.
        expect(requiredPaths(reservationSchema)).toEqual([
            'expiresAt',
            'items',
            'orderId',
            'status'
        ]);
    });

    it('restricts status to the three states and starts every hold held', () => {
        // Terminal states are terminal — nothing leaves `committed` or `released` — so the enum
        // is the whole state machine. A fourth value would be a state no operation handles.
        expect(enumOf(reservationSchema, 'status')).toEqual(['held', 'committed', 'released']);
        expect(defaultOf(reservationSchema, 'status')).toBe('held');
    });

    it('carries its own copy of what was claimed, requiring a positive quantity', () => {
        const item = subSchema(reservationSchema, 'items');

        // `min: 1`: a zero-quantity line claims nothing and would be given back as nothing,
        // leaving the counter it was supposed to move untouched.
        expect(requiredPaths(item)).toEqual(['productId', 'quantity']);
        expect(pathOptions(item, 'quantity').min).toBe(1);
        expect(optionsOf(item)._id).toBe(false);
    });

    it('indexes the sweep query and nothing more', () => {
        // The sweep asks for holds still held, oldest deadline first — `status` then `expiresAt`,
        // both ascending. The unique `orderId` index is the exactly-once gate above.
        expect(indexSpecs(reservationSchema)).toEqual([
            'orderId_1: orderId+1',
            'reservations_status_expiresAt: status+1, expiresAt+1'
        ]);
    });

    it('does not expire holds with a TTL index', () => {
        // Deliberate, and the comment in the model says so: a TTL index DELETES the document,
        // but the units have to be given back and the story has to survive. Expiry is a sweep.
        // A TTL index added here would silently drop reservations and leak stock.
        for (const options of Object.values(indexBehaviour(reservationSchema)))
            expect(options).not.toHaveProperty('expireAfterSeconds');
    });
});
