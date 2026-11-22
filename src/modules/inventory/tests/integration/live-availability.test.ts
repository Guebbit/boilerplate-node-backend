/**
 * `liveAvailabilityOf`: the availability the cart clamps from, read from the ledger now and never
 * from the 60-second cache. It is the same judgement as the HTTP reads, plus the shelf behind it.
 *
 * Risk:    a clamp that works from a cached number lets a cart write through on a sale the cache
 *          has not seen yet.
 * Real:    the service, the ledger and the catalogue; the cache adapter is the real one, which
 *          answers every read with a miss without Redis, so only a LIVE read can see a move.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { testCallerContext } from '@tests/callers';
import { MISSING_ID } from '@tests/ids';
import { inventoryService } from '../../services';
import { forceStockLevel } from '../factories';

setupTestDb();

describe('liveAvailabilityOf', () => {
    it('answers the shelf as both the number and the shelf, with no date', async () => {
        const product = await createProduct({ onHand: 4 });

        const live = await inventoryService.liveAvailabilityOf([String(product._id)]);

        expect(live.get(String(product._id))).toEqual({
            availability: 'in_stock',
            quantityAvailable: 4,
            shelf: 4
        });
    });

    it('sees a stock move at once', async () => {
        const product = await createProduct({ onHand: 4 });
        await inventoryService.adjust(String(product._id), -3, 'stocktake', testCallerContext);

        const live = await inventoryService.liveAvailabilityOf([String(product._id)]);

        expect(live.get(String(product._id))).toMatchObject({ quantityAvailable: 1, shelf: 1 });
    });

    it('reads 0 for an off-sale product whatever is on the shelf, and keeps the shelf', async () => {
        const product = await createProduct({ onHand: 9, purchasable: false });

        const live = await inventoryService.liveAvailabilityOf([String(product._id)]);

        expect(live.get(String(product._id))).toEqual({
            availability: 'out_of_stock',
            quantityAvailable: 0,
            shelf: 9
        });
    });

    it('leaves quantityAvailable out for an uncapped backorder, and counts the room otherwise', async () => {
        const uncapped = await createProduct({
            onHand: 2,
            allowBackorder: true,
            backorderLimit: null
        });
        const capped = await createProduct({
            onHand: 2,
            allowBackorder: true,
            backorderLimit: 5,
            backordered: 1
        });

        const live = await inventoryService.liveAvailabilityOf([
            String(uncapped._id),
            String(capped._id)
        ]);

        expect(live.get(String(uncapped._id))).toEqual({ availability: 'in_stock', shelf: 2 });
        expect(live.get(String(capped._id))).toEqual({
            availability: 'in_stock',
            quantityAvailable: 6,
            shelf: 2
        });
    });

    it('reads an emptied level as sold out with 0', async () => {
        const product = await createProduct({ onHand: 3 });
        await forceStockLevel(product._id, 0, 0);

        const live = await inventoryService.liveAvailabilityOf([String(product._id)]);

        expect(live.get(String(product._id))).toMatchObject({
            availability: 'out_of_stock',
            quantityAvailable: 0,
            shelf: 0
        });
    });

    it('leaves an unknown product out, and answers a repeated id once', async () => {
        const product = await createProduct({ onHand: 1 });

        const live = await inventoryService.liveAvailabilityOf([
            String(product._id),
            MISSING_ID,
            String(product._id)
        ]);

        expect([...live.keys()]).toEqual([String(product._id)]);
    });
});
