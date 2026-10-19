/**
 * @module
 * Every write that makes a unit sellable serves the paid buyers waiting for stock first, in its
 * own transaction: a stocktake that finds units, a returned parcel, an expired or cancelled hold,
 * a remainder cancel. Not only a receipt.
 *
 * See: docs/modules/inventory-reservations.md#preorders
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { withTransaction } from '@infrastructure/runtime/database';
import { inventoryService } from '../../services';
import { reservationModel } from '../../model';
import { reservationRepository, stockLevelRepository } from '../../repository';
import { testCallerContext } from '@tests/callers';

setupTestDb();

/** A syntactically valid order id, distinct per call — holds are keyed by one. */
let orderCounter = 0;
const anOrderId = () => (++orderCounter).toString(16).padStart(24, 'e');

/** The counters that show where a unit went. */
const levelOf = (productId: string) =>
    stockLevelRepository.findByProductId(productId).then((level) => ({
        onHand: level?.onHand,
        reserved: level?.reserved,
        available: level?.available,
        backordered: level?.backordered
    }));

/** What the waiting buyer's hold holds now. */
const itemsOf = (orderId: string) =>
    reservationRepository
        .findByOrderId(orderId)
        .then((hold) => (hold?.items ?? []).map(({ quantity, kind }) => ({ quantity, kind })));

/**
 * A sold-out product with a buyer who has paid for one unit that does not exist yet.
 *
 * @param shelf - units on the shelf; all of them are held by `holder`, so none is sellable
 */
const soldOutWithAPaidBuyerWaiting = async (shelf: number) => {
    const product = await createProduct({ onHand: shelf });
    const productId = String(product._id);
    await inventoryService.setBackorderLimit(productId, 5);
    const holder = anOrderId();
    if (shelf > 0) await inventoryService.reserveForOrder(holder, [{ productId, quantity: shelf }]);
    const waiting = anOrderId();
    await inventoryService.reserveForOrder(waiting, [
        { productId, quantity: 1, kind: 'backorder' }
    ]);
    await inventoryService.commitForOrder(waiting);
    return { productId, holder, waiting };
};

describe('a unit that becomes sellable', () => {
    it('goes to the paid buyer waiting when a stocktake finds it', async () => {
        const { productId, waiting } = await soldOutWithAPaidBuyerWaiting(0);

        await inventoryService.adjust(productId, 1, 'found in the back', testCallerContext);

        expect(await itemsOf(waiting)).toEqual([{ quantity: 1, kind: 'stock' }]);
        expect(await levelOf(productId)).toEqual({
            onHand: 1,
            reserved: 1,
            available: 0,
            backordered: 0
        });
    });

    it('goes to the paid buyer waiting when a returned parcel is restocked', async () => {
        const { productId, waiting } = await soldOutWithAPaidBuyerWaiting(0);

        await withTransaction((session) =>
            inventoryService.restockReturnedLines(
                [{ productId, quantity: 1 }],
                { reference: anOrderId(), note: 'return' },
                session
            )
        );

        expect(await itemsOf(waiting)).toEqual([{ quantity: 1, kind: 'stock' }]);
        expect(await levelOf(productId)).toMatchObject({
            reserved: 1,
            available: 0,
            backordered: 0
        });
    });

    it('goes to the paid buyer waiting when an unpaid hold expires', async () => {
        const { productId, holder, waiting } = await soldOutWithAPaidBuyerWaiting(2);
        await reservationModel.updateOne({ orderId: holder }, { expiresAt: new Date(0) });

        await inventoryService.runReservationSweep();

        expect(await itemsOf(waiting)).toEqual([{ quantity: 1, kind: 'stock' }]);
        // Two came back, one went to the queue: the other is for sale.
        expect(await levelOf(productId)).toMatchObject({
            reserved: 1,
            available: 1,
            backordered: 0
        });
    });

    it('goes to the paid buyer waiting when an unpaid order is cancelled', async () => {
        const { productId, holder, waiting } = await soldOutWithAPaidBuyerWaiting(1);

        await inventoryService.releaseForOrder(holder);

        expect(await itemsOf(waiting)).toEqual([{ quantity: 1, kind: 'stock' }]);
        expect(await levelOf(productId)).toMatchObject({
            reserved: 1,
            available: 0,
            backordered: 0
        });
    });

    it('goes to the paid buyer waiting when a paid order is cancelled', async () => {
        const { productId, holder, waiting } = await soldOutWithAPaidBuyerWaiting(1);
        await inventoryService.commitForOrder(holder);

        await withTransaction((session) =>
            inventoryService.releaseCommittedForOrder(holder, session)
        );

        expect(await itemsOf(waiting)).toEqual([{ quantity: 1, kind: 'stock' }]);
        expect(await levelOf(productId)).toMatchObject({
            reserved: 1,
            available: 0,
            backordered: 0
        });
    });

    it('goes to the paid buyer waiting when the rest of a shipment is cancelled', async () => {
        const { productId, holder, waiting } = await soldOutWithAPaidBuyerWaiting(2);
        await inventoryService.commitForOrder(holder);

        await withTransaction((session) =>
            inventoryService.releaseLinesForOrder(holder, [{ productId, quantity: 1 }], session)
        );

        expect(await itemsOf(waiting)).toEqual([{ quantity: 1, kind: 'stock' }]);
        expect(await levelOf(productId)).toMatchObject({
            reserved: 2,
            available: 0,
            backordered: 0
        });
    });

    it('does not take a unit from a buyer whose claim was only given back', async () => {
        const { productId, waiting } = await soldOutWithAPaidBuyerWaiting(0);

        // A claim given back frees allowance, not shelf units: nobody is served by it.
        await withTransaction((session) =>
            inventoryService.releaseLinesForOrder(
                waiting,
                [{ productId, quantity: 1, kind: 'backorder' }],
                session
            )
        );

        expect(await levelOf(productId)).toMatchObject({ available: 0, backordered: 0 });
    });
});
