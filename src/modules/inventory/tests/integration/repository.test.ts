/**
 * @module
 * `stockLevelRepository`'s own aggregate reads against a real Mongo instance, including their
 * answers over an empty collection — a `$group`/`$facet` pipeline returns no row at all rather
 * than a zeroed one, so the `.at(0)` arm the calling code guards is asserted, not assumed. The
 * transition path itself (`applyDelta`, `ensure`) is exercised through `../../service.ts`'s own
 * tests, which is where its guarantees actually matter; this file is the aggregates alone.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { stockLevelRepository } from '../../repository';
import { stockLevelModel } from '../../model';

setupTestDb();

describe('an empty collection', () => {
    it('sums zero reserved units when there is nothing to reserve', async () => {
        await expect(stockLevelRepository.sumReserved()).resolves.toBe(0);
    });

    it('serves an empty stock board with a zero total', async () => {
        await expect(stockLevelRepository.stockBoard({ skip: 0, limit: 10 })).resolves.toEqual({
            items: [],
            totalItems: 0
        });
    });

    it('names zero low-availability products', async () => {
        await expect(stockLevelRepository.lowAvailabilityProductIds(5)).resolves.toEqual([]);
    });
});

/*
 * `docs/modules/inventory-reservations.md` §"The threshold, and its two readers": the stock
 * board's `lowOnly` filter counts the WHOLE catalogue (an admin restocking needs an inactive
 * product too); `service.ts`'s `lowStockCount` narrows `lowAvailabilityProductIds`' candidates to
 * PUBLICLY VISIBLE products only (a customer can't buy what they can't see, so an alert about it
 * is noise) — "the two numbers will not match, and should not." `sumReserved` carries no scope at
 * all: an inactive product still holds units. Visibility itself is `products`' rule to apply, not
 * this repository's — see `lowAvailabilityProductIds`'s own docblock — so THAT half of the
 * behaviour is asserted in `../../tests/integration/service.test.ts` instead of here.
 */
describe('the two stock gauges count different populations', () => {
    // Own collection, own module — clearing it (not `products`) is enough: both gauges query
    // FROM the stock level; visibility is applied afterwards, by `products`, not by a join here.
    beforeEach(() => stockLevelModel.deleteMany({}));

    it('lowAvailabilityProductIds names every candidate, visible or not', async () => {
        const visible = await createProduct({ active: true, onHand: 2, reserved: 0 }); // available 2
        const alsoVisible = await createProduct({ active: true, onHand: 40, reserved: 40 }); // available 0
        const hidden = await createProduct({ active: false, onHand: 1, reserved: 0 }); // available 1

        // The all-reserved product is a candidate too: this is AVAILABILITY, not `onHand` — a
        // bare `$lte: onHand` would read it as healthy while the storefront shows sold out.
        // Visibility is deliberately NOT filtered here — see the describe block's note.
        await expect(stockLevelRepository.lowAvailabilityProductIds(5)).resolves.toEqual(
            expect.arrayContaining([
                String(visible._id),
                String(alsoVisible._id),
                String(hidden._id)
            ])
        );
    });

    it('sumReserved counts every product, visible or not', async () => {
        await createProduct({ active: true, onHand: 40, reserved: 40 });
        await createProduct({ active: false, onHand: 1, reserved: 1 });

        await expect(stockLevelRepository.sumReserved()).resolves.toBe(41);
    });
});
