/**
 * @module
 * `isBuyable` and `becameBuyable`, from the products domain. Pure, so every edge of the flip runs
 * against a fixed clock.
 */
import { becameBuyable, isBuyable } from '../../domain/buyable';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const LATER = new Date('2026-12-01T00:00:00.000Z');
const EARLIER = new Date('2026-09-01T00:00:00.000Z');

describe('isBuyable', () => {
    it.each([
        ['units on the shelf', { onHand: 3, reserved: 1 }, true],
        ['a shelf that is all promised', { onHand: 3, reserved: 3 }, false],
        ['an empty shelf', {}, false],
        ['an empty shelf with backorder open', { allowBackorder: true, backorderLimit: 5 }, true],
        [
            'backorder on, with its cap full',
            { allowBackorder: true, backorderLimit: 2, backordered: 2 },
            false
        ],
        [
            'backorder on, with its date passed',
            { allowBackorder: true, backorderLimit: 5, restockDate: EARLIER },
            false
        ],
        ['a hidden product with stock', { onHand: 3, active: false }, false],
        ['an off-sale product with stock', { onHand: 3, purchasable: false }, false],
        ['a preorder with allowance left', { releaseDate: LATER, backorderLimit: 3 }, true],
        [
            'a preorder with its allowance full',
            { releaseDate: LATER, backorderLimit: 3, backordered: 3 },
            false
        ],
        ['a preorder, whatever the shelf holds', { releaseDate: LATER, onHand: 9 }, false]
    ])('%s', (_name, facts, expected) => {
        expect(isBuyable(facts, NOW)).toBe(expected);
    });
});

describe('becameBuyable', () => {
    it.each([
        ['stock arrives', {}, { onHand: 2 }, true],
        ['stock arrives for a product already buyable', { onHand: 1 }, { onHand: 5 }, false],
        ['stock runs out', { onHand: 1 }, {}, false],
        ['backorder opens', {}, { allowBackorder: true, backorderLimit: 5 }, true],
        ['the product is shown again', { onHand: 2, active: false }, { onHand: 2 }, true],
        ['the product is put back on sale', { onHand: 2, purchasable: false }, { onHand: 2 }, true],
        [
            'a missed restock date is moved on',
            { allowBackorder: true, backorderLimit: 5, restockDate: EARLIER },
            { allowBackorder: true, backorderLimit: 5, restockDate: LATER },
            true
        ]
    ])('%s', (_name, before, after, expected) => {
        expect(becameBuyable(before, after, NOW)).toBe(expected);
    });
});
