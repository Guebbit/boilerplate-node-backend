/**
 * @module
 * `availabilityOf`, from the products domain: Google Merchant's `availability` and
 * `availabilityDate` from a product's settings and its inventory counts. Pure, so every edge runs
 * against a fixed clock.
 */
import { availabilityOf } from '../../domain/availability';

/** The days promised when a backorder names no restock date. */
const PROMISE_DAYS = 30;

/** The instant availability is judged at. */
const NOW = new Date('2026-10-12T10:00:00.000Z');

/** A date after NOW. */
const LATER = new Date('2026-12-01T00:00:00.000Z');

/** A date before NOW. */
const EARLIER = new Date('2026-09-01T00:00:00.000Z');

describe('availabilityOf', () => {
    it.each([
        ['units on the shelf', {}, { available: 3 }, { availability: 'in_stock' }],
        ['an empty shelf', {}, { available: 0 }, { availability: 'out_of_stock' }],
        [
            'an empty shelf with backorder open and no restock date',
            { allowBackorder: true },
            { available: 0, backorderLimit: 5 },
            { availability: 'backorder', availabilityDate: new Date('2026-11-11T10:00:00.000Z') }
        ],
        [
            'an empty shelf with backorder open and a restock date',
            { allowBackorder: true, restockDate: LATER },
            { available: 0, backorderLimit: null },
            { availability: 'backorder', availabilityDate: LATER }
        ],
        [
            'backorder on with its cap full',
            { allowBackorder: true },
            { available: 0, backorderLimit: 2, backordered: 2 },
            { availability: 'out_of_stock' }
        ],
        [
            'backorder on with its restock date passed',
            { allowBackorder: true, restockDate: EARLIER },
            { available: 0, backorderLimit: 5 },
            { availability: 'out_of_stock' }
        ],
        [
            'shelf units, even with backorder open',
            { allowBackorder: true },
            { available: 2, backorderLimit: 5 },
            { availability: 'in_stock' }
        ],
        [
            'a preorder with allowance left',
            { releaseDate: LATER },
            { available: 9, backorderLimit: 3 },
            { availability: 'preorder', availabilityDate: LATER }
        ],
        [
            'a preorder with its allowance full',
            { releaseDate: LATER },
            { available: 9, backorderLimit: 3, backordered: 3 },
            { availability: 'out_of_stock' }
        ],
        [
            'a preorder with no allowance set',
            { releaseDate: LATER },
            { available: 9 },
            { availability: 'out_of_stock' }
        ],
        [
            'a released product, its release date behind it',
            { releaseDate: EARLIER },
            { available: 1 },
            { availability: 'in_stock' }
        ],
        [
            'a hidden product with stock',
            { active: false },
            { available: 3 },
            { availability: 'out_of_stock' }
        ],
        [
            'an off-sale product with stock',
            { purchasable: false },
            { available: 3 },
            { availability: 'out_of_stock' }
        ],
        [
            'a soft-deleted product with stock',
            { deletedAt: EARLIER },
            { available: 3 },
            { availability: 'out_of_stock' }
        ]
    ])('%s', (_name, terms, counts, expected) => {
        expect(availabilityOf(terms, counts, NOW, PROMISE_DAYS)).toEqual(expected);
    });

    it('counts the promised days from now, across a month and a year end', () => {
        const december = new Date('2026-12-20T12:00:00.000Z');

        expect(
            availabilityOf(
                { allowBackorder: true },
                { available: 0, backorderLimit: 5 },
                december,
                PROMISE_DAYS
            )
        ).toEqual({
            availability: 'backorder',
            availabilityDate: new Date('2027-01-19T12:00:00.000Z')
        });
    });
});
