/**
 * @module
 * Topping an order's hold up after a parcel was lost: the free shelf units are reserved, never
 * another order's; the rest is claimed OUTSIDE the backorder cap; a hold that already ended is
 * reopened `committed` and keeps its place in the paid queue; giving the top-up back ends the hold
 * `shipped`, not `released`.
 *
 * See: docs/modules/inventory-reservations.md#owed-after-a-loss
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { withTransaction } from '@infrastructure/runtime/database';
import { createProduct } from '@modules/products/tests/factories';
import { inventoryService } from '../../services';
import { reservationRepository, stockLevelRepository } from '../../repository';
import { removeLevel } from '../factories';

setupTestDb();

/** A syntactically valid order id, distinct per call — holds are keyed by one. */
let orderCounter = 0;
const anOrderId = () => (++orderCounter).toString(16).padStart(24, 'e');

/** A product with `shelf` units on hand, closed to backorder (the cap is `0`, the default). */
const productWith = (shelf: number) =>
    createProduct({ onHand: shelf }).then((product) => String(product._id));

/** An order that held, paid for and shipped `quantity` units of the product. */
const shippedOrder = async (productId: string, quantity: number) => {
    const orderId = anOrderId();
    await inventoryService.reserveForOrder(orderId, [{ productId, quantity }]);
    await inventoryService.commitForOrder(orderId);
    await withTransaction((session) =>
        inventoryService.shipLinesForOrder(orderId, [{ productId, quantity }], session)
    );
    return orderId;
};

/** The counters that show where units went. */
const levelOf = (productId: string) =>
    stockLevelRepository.findByProductId(productId).then((level) => ({
        onHand: level?.onHand,
        reserved: level?.reserved,
        available: level?.available,
        backordered: level?.backordered
    }));

/** What the hold says it holds, with its status. */
const holdOf = (orderId: string) =>
    reservationRepository.findByOrderId(orderId).then((hold) => ({
        status: hold?.status,
        committedAt: hold?.committedAt,
        items: (hold?.items ?? []).map(({ quantity, kind }) => ({ quantity, kind }))
    }));

/** What the hold says it holds. */
const itemsOf = (orderId: string) => holdOf(orderId).then((hold) => hold.items);

/** The hold's status. */
const statusOf = (orderId: string) => holdOf(orderId).then((hold) => hold.status);

/** Top the order's hold up in one transaction. */
const topUp = (orderId: string, productId: string, quantity: number) =>
    withTransaction((session) =>
        inventoryService.reserveMoreForOrder(orderId, [{ productId, quantity }], session)
    );

describe('reserveMoreForOrder', () => {
    it('reserves what the shelf has free and owes nothing when it covers the parcel', async () => {
        const productId = await productWith(10);
        const orderId = await shippedOrder(productId, 2);

        const taken = await topUp(orderId, productId, 2);

        expect(taken).toEqual([{ productId, shelf: 2, owed: 0 }]);
        expect(await levelOf(productId)).toEqual({
            onHand: 8,
            reserved: 2,
            available: 6,
            backordered: 0
        });
    });

    it('reopens a hold that ended shipped, keeping the original payment’s place in the queue', async () => {
        const productId = await productWith(10);
        const orderId = await shippedOrder(productId, 2);
        const before = await holdOf(orderId);
        expect(before.status).toBe('shipped');

        await topUp(orderId, productId, 2);

        const after = await holdOf(orderId);
        expect(after).toEqual({
            status: 'committed',
            committedAt: before.committedAt,
            items: [{ quantity: 2, kind: 'stock' }]
        });
    });

    it('claims the units the shelf cannot cover outside the cap, which is closed', async () => {
        const productId = await productWith(3);
        const orderId = await shippedOrder(productId, 3);
        // The parcel took all 3; one unit comes back on the shelf by a receipt.
        await inventoryService.receive(productId, 1, undefined, testCallerContext);

        const taken = await topUp(orderId, productId, 3);

        expect(taken).toEqual([{ productId, shelf: 1, owed: 2 }]);
        expect(await levelOf(productId)).toMatchObject({ reserved: 1, backordered: 2 });
        expect(await itemsOf(orderId)).toEqual([
            { quantity: 1, kind: 'stock' },
            { quantity: 2, kind: 'backorder' }
        ]);
    });

    it('never takes a unit held for another order', async () => {
        const productId = await productWith(4);
        const orderId = await shippedOrder(productId, 2);
        await inventoryService.reserveForOrder(anOrderId(), [{ productId, quantity: 2 }]);

        const taken = await topUp(orderId, productId, 2);

        expect(taken).toEqual([{ productId, shelf: 0, owed: 2 }]);
        expect(await levelOf(productId)).toMatchObject({ reserved: 2, backordered: 2 });
    });

    it('grows an open hold instead of replacing it', async () => {
        const productId = await productWith(10);
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [{ productId, quantity: 3 }]);
        await inventoryService.commitForOrder(orderId);
        await withTransaction((session) =>
            inventoryService.shipLinesForOrder(orderId, [{ productId, quantity: 1 }], session)
        );

        await topUp(orderId, productId, 1);

        expect(await holdOf(orderId)).toMatchObject({
            status: 'committed',
            items: [{ quantity: 3, kind: 'stock' }]
        });
    });

    it('claims nothing and does not fail for a product with no stock level', async () => {
        const productId = await productWith(2);
        const orderId = await shippedOrder(productId, 1);
        await removeLevel(productId);

        const taken = await topUp(orderId, productId, 1);

        expect(taken).toEqual([{ productId, shelf: 0, owed: 0 }]);
    });
});

describe('releaseTopUpForOrder', () => {
    it('gives both parts back and ends the hold shipped, not released', async () => {
        const productId = await productWith(1);
        const orderId = await shippedOrder(productId, 1);
        await topUp(orderId, productId, 1);
        expect(await levelOf(productId)).toMatchObject({ backordered: 1 });

        await withTransaction((session) =>
            inventoryService.releaseTopUpForOrder(
                orderId,
                [{ productId, quantity: 1, kind: 'backorder' }],
                session
            )
        );

        expect(await levelOf(productId)).toMatchObject({ reserved: 0, backordered: 0 });
        expect(await statusOf(orderId)).toBe('shipped');
    });
});
