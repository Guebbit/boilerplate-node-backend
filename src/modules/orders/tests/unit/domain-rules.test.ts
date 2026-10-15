/**
 * @module
 * Order rules — `src/modules/orders/domain/rules.ts`. No mocks, no database, no fake timers:
 * the rules take arguments and return verdicts.
 */

import {
    buyerIdOf,
    checkOrderLines,
    isBuyer,
    isShippedItem,
    isDigitalOnlyOrder,
    type OrderLineCandidate
} from '../../domain/rules';

/** A line whose product resolved. */
const line = (quantity = 1): OrderLineCandidate => ({ quantity, product: { price: 10 } });

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

describe('isShippedItem', () => {
    it('reads a physical line (requiresShipping omitted) as shipped', () => {
        expect(isShippedItem({ product: {} })).toBe(true);
    });

    it('reads requiresShipping: true as shipped', () => {
        expect(isShippedItem({ product: { requiresShipping: true } })).toBe(true);
    });

    it('reads requiresShipping: false as digital, not shipped', () => {
        expect(isShippedItem({ product: { requiresShipping: false } })).toBe(false);
    });

    it('reads a missing product as shipped — the safe direction for an unresolved line', () => {
        expect(isShippedItem({ product: null })).toBe(true);
        expect(isShippedItem({})).toBe(true);
    });
});

describe('isDigitalOnlyOrder', () => {
    it('is false for an order with no lines — there is nothing to call digital', () => {
        expect(isDigitalOnlyOrder([])).toBe(false);
    });

    it('is true only when every line is digital', () => {
        expect(
            isDigitalOnlyOrder([
                { product: { requiresShipping: false } },
                { product: { requiresShipping: false } }
            ])
        ).toBe(true);
    });

    it('is false when even one line still needs shipping', () => {
        expect(
            isDigitalOnlyOrder([
                { product: { requiresShipping: false } },
                { product: { requiresShipping: true } }
            ])
        ).toBe(false);
    });
});

// Not here: the soft delete and the read scope. Both are one-line expressions with one
// caller each, so they live in the service (`../../services/crud`, `../../services/scope`) rather
// than the domain layer — `service-crud.test.ts` covers the soft delete and `service-scope.test.ts` the
// scope, including the fail-closed cases.

describe('buyerIdOf and isBuyer', () => {
    it('spells the buyer the way a caller carries their own id, and is empty for an erased one', () => {
        expect(buyerIdOf({ userId: { toString: () => 'user-1' } })).toBe('user-1');
        expect(buyerIdOf({ userId: undefined })).toBeUndefined();
        expect(buyerIdOf({ userId: null })).toBeUndefined();
    });

    it('recognises the buyer by id, and never an erased buyer or a caller with no id', () => {
        const order = { userId: 'user-1' };

        expect(isBuyer(order, { id: 'user-1' })).toBe(true);
        expect(isBuyer(order, { id: 'user-2' })).toBe(false);
        expect(isBuyer(order, { id: null })).toBe(false);
        expect(isBuyer(order, undefined)).toBe(false);
        expect(isBuyer({ userId: undefined }, { id: undefined })).toBe(false);
    });
});
