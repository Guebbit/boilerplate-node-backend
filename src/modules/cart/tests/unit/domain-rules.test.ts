/**
 * Cart rules — `src/modules/cart/domain/rules.ts`.
 *
 * No mocks, no database. The verdict-to-status mapping is covered in `service.test.ts`.
 */

import { evaluateCheckout, type ICartLineCandidate } from '../../domain/rules';

const line = (quantity = 1, stock?: number): ICartLineCandidate => ({
    quantity,
    product: stock === undefined ? {} : { stock }
});

describe('evaluateCheckout', () => {
    it('refuses an empty cart', () => {
        expect(evaluateCheckout([])).toEqual({ ok: false, reason: 'empty' });
    });

    it('accepts a cart whose lines all resolved', () => {
        expect(evaluateCheckout([line(), line(2)])).toEqual({ ok: true });
    });

    // `null` is the real case: `populate()` writes it when the product was deleted.
    it.each([
        ['a deleted product (null)', null],
        ['an absent product (undefined)', undefined]
    ])('refuses a cart holding %s', (_label, product) => {
        expect(evaluateCheckout([line(), { quantity: 1, product }])).toEqual({
            ok: false,
            reason: 'product-unavailable'
        });
    });

    // Order matters: the two reasons map to different status codes and analytics categories.
    it('reports emptiness before availability', () => {
        expect(evaluateCheckout([])).toEqual({ ok: false, reason: 'empty' });
    });

    it('refuses a line asking for more than the shelf holds', () => {
        expect(evaluateCheckout([line(1, 5), line(6, 5)])).toEqual({
            ok: false,
            reason: 'insufficient-stock'
        });
    });

    it('accepts a line taking exactly the last units', () => {
        expect(evaluateCheckout([line(5, 5)])).toEqual({ ok: true });
    });

    // Rows that predate the stock backfill have no column; they must stay sellable rather
    // than all reading as sold out.
    it('treats an absent stock as unconstrained', () => {
        expect(evaluateCheckout([line(999)])).toEqual({ ok: true });
    });

    // Availability outranks stock: a vanished product is the harder failure, and its 404
    // must not be masked by a 409 about a count nobody can see.
    it('reports availability before stock', () => {
        expect(evaluateCheckout([{ quantity: 9, product: null }, line(6, 5)])).toEqual({
            ok: false,
            reason: 'product-unavailable'
        });
    });
});
