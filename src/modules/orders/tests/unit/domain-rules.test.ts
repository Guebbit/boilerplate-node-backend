/**
 * Order rules — `src/modules/orders/domain/rules.ts`.
 *
 * No mocks, no database, no fake timers — the rules take arguments and return verdicts.
 */

import {
    checkOrderLines,
    nextDeletionState,
    readScope,
    type IOrderLineCandidate
} from '../../domain/rules';

/** A line whose product resolved. */
const line = (quantity = 1): IOrderLineCandidate => ({ quantity, product: { price: 10 } });

describe('checkOrderLines', () => {
    it('refuses an empty set, naming the reason', () => {
        expect(checkOrderLines([])).toEqual({ ok: false, reason: 'no-lines' });
    });

    it('accepts lines whose products all resolved', () => {
        expect(checkOrderLines([line(), line(3)])).toEqual({ ok: true });
    });

    // The two reasons map to different status codes, so they must stay distinct.
    it.each([
        ['undefined', undefined],
        ['null', null]
    ])('refuses the whole set when a product is %s', (_label, product) => {
        expect(checkOrderLines([line(), { quantity: 1, product }])).toEqual({
            ok: false,
            reason: 'product-missing'
        });
    });

    it('refuses on an unresolved product even when other lines are fine', () => {
        // An order embeds a snapshot: a missing product cannot be dropped and the rest kept.
        expect(checkOrderLines([line(), line(), { quantity: 9, product: null }]).ok).toBe(false);
    });
});

describe('nextDeletionState', () => {
    const now = new Date('2026-08-12T10:00:00.000Z');

    it('stamps the given instant when the order is live', () => {
        expect(nextDeletionState(undefined, now)).toBe(now);
    });

    it('clears the stamp when the order is already soft-deleted — delete toggles', () => {
        expect(nextDeletionState(new Date('2020-01-01'), now)).toBeUndefined();
    });

    it('is a pure toggle: applying it twice returns to live', () => {
        const deleted = nextDeletionState(undefined, now);
        expect(nextDeletionState(deleted, now)).toBeUndefined();
    });
});

describe('readScope', () => {
    it('gives an admin an unrestricted scope', () => {
        expect(readScope({ id: 'abc', admin: true })).toEqual({ kind: 'all' });
    });

    it('restricts a normal caller to their own orders', () => {
        expect(readScope({ id: 'abc' })).toEqual({ kind: 'own', userId: 'abc' });
    });

    // Fails closed: the empty id is an invalid ObjectId, so the repository throws.
    it.each([
        ['no caller', undefined],
        ['an empty context', {}],
        ['admin explicitly false', { admin: false }]
    ])('restricts %s to an unusable own-scope rather than widening', (_label, caller) => {
        expect(readScope(caller)).toEqual({ kind: 'own', userId: '' });
    });
});
