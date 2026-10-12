/**
 * @module
 * `lineAvailability` — the one precedence rule behind a cart line, a wishlist line, a merge result
 * and checkout's refusal. Every row of the precedence table, cart and wishlist variants.
 *
 * No mocks, no database.
 */

import { lineAvailability, type AvailabilityFacts } from '../../domain';

/** A product that is shown, on sale and not deleted: the base every case bends one field of. */
const LIVE = { active: true, purchasable: true };

describe('lineAvailability', () => {
    it.each<[string, AvailabilityFacts, string]>([
        ['no product row (hard-deleted)', { product: null, available: 9, quantity: 1 }, 'removed'],
        ['an absent product', { product: undefined, available: 9, quantity: 1 }, 'removed'],
        [
            'a soft-deleted product',
            { product: { ...LIVE, deletedAt: new Date() }, available: 9, quantity: 1 },
            'removed'
        ],
        [
            'a hidden product',
            { product: { ...LIVE, active: false }, available: 9, quantity: 1 },
            'removed'
        ],
        [
            'a hidden product that is also off sale',
            { product: { active: false, purchasable: false }, available: 9, quantity: 1 },
            'removed'
        ],
        [
            'an off-sale product with stock',
            { product: { ...LIVE, purchasable: false }, available: 9, quantity: 1 },
            'unavailable'
        ],
        [
            'an off-sale product with none left',
            { product: { ...LIVE, purchasable: false }, available: 0, quantity: 1 },
            'unavailable'
        ],
        ['a product with none left', { product: LIVE, available: 0, quantity: 1 }, 'out_of_stock'],
        [
            'a product with no level row',
            { product: LIVE, available: undefined, quantity: 1 },
            'out_of_stock'
        ],
        [
            'a line wanting more than is left',
            { product: LIVE, available: 2, quantity: 3 },
            'insufficient_stock'
        ],
        [
            'a line wanting exactly what is left',
            { product: LIVE, available: 3, quantity: 3 },
            'in_stock'
        ],
        [
            'a line wanting less than is left',
            { product: LIVE, available: 5, quantity: 3 },
            'in_stock'
        ],
        [
            'a product that never set the flags',
            { product: {}, available: 5, quantity: 1 },
            'in_stock'
        ],
        [
            'a preorder whose allowance covers the line',
            { product: { ...LIVE, preorder: true }, available: 3, quantity: 3 },
            'preorder'
        ],
        [
            'a preorder wanting more than its allowance has left',
            { product: { ...LIVE, preorder: true }, available: 2, quantity: 3 },
            'insufficient_stock'
        ],
        [
            'a preorder with its allowance full',
            { product: { ...LIVE, preorder: true }, available: 0, quantity: 1 },
            'out_of_stock'
        ],
        [
            'a hidden preorder, which hidden still wins over',
            { product: { ...LIVE, active: false, preorder: true }, available: 5, quantity: 1 },
            'removed'
        ]
    ])('cart line, %s: %s', (_label, facts, expected) => {
        expect(lineAvailability(facts)).toBe(expected);
    });

    it.each<[string, AvailabilityFacts, string]>([
        ['stock', { product: LIVE, available: 1 }, 'in_stock'],
        ['none left', { product: LIVE, available: 0 }, 'out_of_stock'],
        ['off sale', { product: { ...LIVE, purchasable: false }, available: 4 }, 'unavailable'],
        ['hidden', { product: { ...LIVE, active: false }, available: 4 }, 'removed'],
        ['gone', { product: null, available: undefined }, 'removed'],
        [
            'a preorder with allowance',
            { product: { ...LIVE, preorder: true }, available: 1 },
            'preorder'
        ]
    ])('wishlist line, %s: %s', (_label, facts, expected) => {
        expect(lineAvailability(facts)).toBe(expected);
    });

    it('never gives a wishlist line insufficient_stock', () => {
        const values = [0, 1, 5, 999].map((available) =>
            lineAvailability({ product: LIVE, available })
        );

        expect(values).not.toContain('insufficient_stock');
    });
});
