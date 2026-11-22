/**
 * @module
 * The cart's stock rules (`fitsStock`, `clampToStock` and `unitsShippingLater`, in its domain
 * layer) that checkout, the cart writes and the view share. No mocks, no database.
 */

import { clampToStock, evaluateCheckout, fitsStock, unitsShippingLater } from '../../domain';

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

describe('clampToStock', () => {
    it.each([
        { wanted: 5, held: 0, available: undefined, quantity: 5, code: undefined },
        { wanted: 3, held: 0, available: 5, quantity: 3, code: undefined },
        { wanted: 5, held: 0, available: 5, quantity: 5, code: undefined },
        { wanted: 6, held: 0, available: 5, quantity: 5, code: 'MERCHANDISE_NOT_ENOUGH_STOCK' },
        { wanted: 6, held: 2, available: 4, quantity: 4, code: 'MERCHANDISE_NOT_ENOUGH_STOCK' },
        { wanted: 2, held: 0, available: 0, quantity: 0, code: 'MERCHANDISE_OUT_OF_STOCK' }
    ])(
        'holds $wanted at $quantity with $held held and $available buyable',
        ({ wanted, held, available, quantity, code }) => {
            expect(clampToStock(wanted, held, available)).toEqual({
                quantity,
                ...(code ? { code } : {})
            });
        }
    );

    it('lets a line above the number be lowered, without a warning', () => {
        expect(clampToStock(2, 8, 3)).toEqual({ quantity: 2 });
        expect(clampToStock(2, 8, 0)).toEqual({ quantity: 2 });
    });

    it('does not lower a line above the number when asked to raise it', () => {
        expect(clampToStock(9, 8, 3)).toEqual({
            quantity: 8,
            code: 'MERCHANDISE_NOT_ENOUGH_STOCK'
        });
        expect(clampToStock(9, 8, 0)).toEqual({ quantity: 8, code: 'MERCHANDISE_OUT_OF_STOCK' });
    });
});

describe('unitsShippingLater', () => {
    it.each([
        { preorder: true, backorder: false, shelf: 0, quantity: 3, later: 3 },
        { preorder: true, backorder: false, shelf: 9, quantity: 3, later: 3 },
        { preorder: false, backorder: true, shelf: 2, quantity: 5, later: 3 },
        { preorder: false, backorder: true, shelf: 0, quantity: 5, later: 5 },
        { preorder: false, backorder: true, shelf: 5, quantity: 5, later: undefined },
        { preorder: false, backorder: false, shelf: 0, quantity: 5, later: undefined }
    ])('$quantity units, shelf $shelf, preorder $preorder, backorder $backorder', (facts) => {
        expect(unitsShippingLater(facts)).toBe(facts.later);
    });
});
