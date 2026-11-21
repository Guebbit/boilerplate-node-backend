/**
 * @module
 * `isBackorder`, from the products domain. Pure, so every edge of the rule runs against a fixed
 * clock.
 */
import { isBackorder } from '../../domain/backorder';

/** The instant availability is judged at. */
const NOW = new Date('2026-10-12T10:00:00.000Z');

/** A date after NOW. */
const LATER = new Date('2026-12-01T00:00:00.000Z');

/** A date before NOW. */
const EARLIER = new Date('2026-09-01T00:00:00.000Z');

/** A switch that is on: the product's terms allow a backorder. */
const ON = { allowBackorder: true };

describe('isBackorder', () => {
    it.each([
        ['the switch on', ON, true],
        ['a restock date still ahead', { ...ON, restockDate: LATER }, true],
        ['a restock date that has passed reads sold out', { ...ON, restockDate: EARLIER }, false],
        ['a restock date exactly now', { ...ON, restockDate: NOW }, false],
        ['the switch off', { ...ON, allowBackorder: false }, false],
        ['the switch never set', {}, false],
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

    it('judges the terms only: the allowance is inventory’s, so a full one does not close it here', () => {
        // The cart asks this to decide whether a line may spill past the shelf; `availableFor` then
        // enforces the allowance, and `availabilityOf` adds it for its own answer.
        const withFullAllowance = { ...ON, backorderLimit: 5, backordered: 5 };

        expect(isBackorder(withFullAllowance, NOW)).toBe(true);
    });
});
