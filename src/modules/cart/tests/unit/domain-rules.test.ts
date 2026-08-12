/**
 * Cart rules — `src/modules/cart/domain/rules.ts`.
 *
 * No mocks, no database. The verdict-to-status mapping is covered in `service.test.ts`.
 */

import { evaluateCheckout, type ICartLineCandidate } from '../../domain/rules';

const line = (quantity = 1): ICartLineCandidate => ({ quantity, product: { price: 5 } });

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
});
