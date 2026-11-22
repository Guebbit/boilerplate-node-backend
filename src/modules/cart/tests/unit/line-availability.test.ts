/**
 * @module
 * `lineAvailability` — the cart's internal precedence rule, behind checkout's refusal. Every row of
 * the precedence table.
 *
 * No mocks, no database.
 */

import { isBuyable, lineAvailability, type AvailabilityFacts } from '../../domain';

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
        ],
        [
            'a backorder product whose shelf covers the line',
            { product: { ...LIVE, backorder: true }, available: 15, shelf: 5, quantity: 3 },
            'in_stock'
        ],
        [
            'a backorder product whose shelf covers part of the line',
            { product: { ...LIVE, backorder: true }, available: 12, shelf: 2, quantity: 3 },
            'backorder'
        ],
        [
            'a backorder product with an empty shelf and room',
            { product: { ...LIVE, backorder: true }, available: 10, shelf: 0, quantity: 3 },
            'backorder'
        ],
        [
            'a backorder product whose shelf and room together fall short',
            { product: { ...LIVE, backorder: true }, available: 2, shelf: 0, quantity: 3 },
            'insufficient_stock'
        ],
        [
            'a backorder product with neither shelf nor room',
            { product: { ...LIVE, backorder: true }, available: 0, shelf: 0, quantity: 1 },
            'out_of_stock'
        ],
        [
            'an unlimited backorder product',
            {
                product: { ...LIVE, backorder: true },
                available: Infinity,
                shelf: 0,
                quantity: 500
            },
            'backorder'
        ],
        [
            'a preorder, whose shelf is ignored',
            { product: { ...LIVE, preorder: true }, available: 5, shelf: 9, quantity: 3 },
            'preorder'
        ]
    ])('cart line, %s: %s', (_label, facts, expected) => {
        expect(lineAvailability(facts)).toBe(expected);
    });
});

describe('isBuyable', () => {
    it.each(['in_stock', 'preorder', 'backorder'] as const)('lets %s become an order', (state) => {
        expect(isBuyable(state)).toBe(true);
    });

    it.each(['insufficient_stock', 'out_of_stock', 'unavailable', 'removed'] as const)(
        'refuses %s',
        (state) => {
            expect(isBuyable(state)).toBe(false);
        }
    );
});
