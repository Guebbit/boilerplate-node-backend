/**
 * @module
 * `isBackorder`, from the products domain. Pure, so every edge of the rule runs against a fixed
 * clock.
 */
import { isBackorder } from '../../domain/backorder';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const LATER = new Date('2026-12-01T00:00:00.000Z');
const EARLIER = new Date('2026-09-01T00:00:00.000Z');
/** A switch that is on, with room under the cap. */
const ON = { allowBackorder: true, backorderLimit: 5, backordered: 2 };

describe('isBackorder', () => {
    it.each([
        ['the switch on with room left', ON, true],
        ['no cap at all (null)', { allowBackorder: true, backorderLimit: null }, true],
        ['a restock date still ahead', { ...ON, restockDate: LATER }, true],
        ['a restock date that has passed reads sold out', { ...ON, restockDate: EARLIER }, false],
        ['a restock date exactly now', { ...ON, restockDate: NOW }, false],
        ['the switch off', { ...ON, allowBackorder: false }, false],
        ['the switch never set', { backorderLimit: 5 }, false],
        ['a cap that was never opened (absent reads closed)', { allowBackorder: true }, false],
        ['a cap of zero', { allowBackorder: true, backorderLimit: 0 }, false],
        ['a full cap', { allowBackorder: true, backorderLimit: 5, backordered: 5 }, false],
        ['a hidden product', { ...ON, active: false }, false],
        ['an off-sale product', { ...ON, purchasable: false }, false],
        [
            'a product not released yet is a preorder, not a backorder',
            { ...ON, releaseDate: LATER },
            false
        ],
        ['a released product', { ...ON, releaseDate: EARLIER }, true]
    ])('%s', (_name, facts, expected) => {
        expect(isBackorder(facts, NOW)).toBe(expected);
    });
});
