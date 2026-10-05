/**
 * @module
 * The one stock rule (`fitsStock`, in the cart's domain layer) that checkout, the merge and the
 * cart view share. No mocks, no database.
 */

import { evaluateCheckout, fitsStock } from '../../domain';

describe('fitsStock', () => {
    it.each([
        { quantity: 1, available: 5, fits: true },
        { quantity: 5, available: 5, fits: true },
        { quantity: 6, available: 5, fits: false },
        { quantity: 1, available: 0, fits: false },
        { quantity: 0, available: 0, fits: true }
    ])('says $fits for $quantity against $available', ({ quantity, available, fits }) => {
        expect(fitsStock(quantity, available)).toBe(fits);
    });

    it('fits nothing when availability is unknown, the product being gone or hidden', () => {
        expect(fitsStock(1, null)).toBe(false);
        expect(fitsStock(1, undefined)).toBe(false);
    });

    it.each([0, 1, 4, 5, 6])(
        'agrees with checkout for 5 asked against %i available: short for one is short for the other',
        (available) => {
            const verdict = evaluateCheckout([
                { productId: 'p', quantity: 5, product: { title: 'T', available } }
            ]);

            expect(verdict.ok).toBe(fitsStock(5, available));
        }
    );
});
