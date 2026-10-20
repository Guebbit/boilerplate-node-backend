/**
 * @module
 * The doors `orders` offers so that no other module drives an order's stock hold: giving a
 * cancelled remainder back (`releaseStock`), keeping an open hold alive (`extendHold`), and the
 * card-confirm pre-check (`isPayableNow`). Real Mongo throughout.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { seedOrder } from '@modules/orders/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { inventoryService } from '@modules/inventory';
import { reservationRepository } from '@modules/inventory/tests/factories';
import { OrderStatus } from '@types';
import { withTransaction } from '@infrastructure/runtime/database';
import { extendHold, isPayableNow, releaseStock } from '../../services/fulfillment';

setupTestDb();

/**
 * An order in `status` whose 3 units of a fresh product are held.
 *
 * @param status - where the order stands
 */
const orderHolding = async (status: OrderStatus) => {
    const product = await createProduct({ onHand: 10 });
    const order = await seedOrder(status);
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(product._id), quantity: 3 }
    ]);
    return { orderId, productId: String(product._id) };
};

describe('extendHold', () => {
    it('moves an open hold’s deadline out to the given hours from now', async () => {
        const { orderId } = await orderHolding(OrderStatus.pending);
        const before = (await reservationRepository.findByOrderId(orderId))!.expiresAt.getTime();

        await extendHold(orderId, 24 * 7);

        const after = (await reservationRepository.findByOrderId(orderId))!.expiresAt.getTime();
        const week = 7 * 24 * 60 * 60_000;
        expect(after).toBeGreaterThan(before);
        expect(Math.abs(after - (Date.now() + week))).toBeLessThan(60_000);
    });

    it('says nothing, and moves nothing, for a hold that is already claimed', async () => {
        const { orderId } = await orderHolding(OrderStatus.pending);
        await inventoryService.commitForOrder(orderId);
        const before = (await reservationRepository.findByOrderId(orderId))!.expiresAt.getTime();

        await expect(extendHold(orderId, 24 * 7)).resolves.toBeUndefined();

        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold!.status).toBe('committed');
        expect(hold!.expiresAt.getTime()).toBe(before);
    });

    it('says nothing for an order that has no hold', async () => {
        const order = await seedOrder(OrderStatus.pending);

        await expect(extendHold(String(order._id), 24)).resolves.toBeUndefined();
    });
});

describe('isPayableNow', () => {
    it('is true for an order awaiting payment whose units are held', async () => {
        const { orderId } = await orderHolding(OrderStatus.pending);

        expect(await isPayableNow(orderId)).toBe(true);
    });

    it('is false once the hold was released, though the order still says pending', async () => {
        // An expiry releases the hold first and cancels the order after: in between, the shelf
        // may be gone and a card must not be charged.
        const { orderId } = await orderHolding(OrderStatus.pending);
        await inventoryService.releaseForOrder(orderId, 'expire');

        expect(await isPayableNow(orderId)).toBe(false);
    });

    it('is true for a pending order that has no hold at all', async () => {
        // Only a CLOSED hold names the oversell; a missing one is not that.
        const order = await seedOrder(OrderStatus.pending);

        expect(await isPayableNow(String(order._id))).toBe(true);
    });

    it('is false for an order that is already past payment', async () => {
        const { orderId } = await orderHolding(OrderStatus.paid);

        expect(await isPayableNow(orderId)).toBe(false);
    });

    it('is false for an order that does not exist', async () => {
        expect(await isPayableNow('64b64b64b64b64b64b64b64b')).toBe(false);
    });
});

describe('releaseStock', () => {
    it('gives the named units back and leaves the rest of the hold', async () => {
        const { orderId, productId } = await orderHolding(OrderStatus.paid);
        await inventoryService.commitForOrder(orderId);

        const released = await withTransaction((session) =>
            releaseStock(orderId, [{ productId, quantity: 1 }], session)
        );
        await inventoryService.refreshStockCacheForProducts([productId]);

        expect(released).toBe(true);
        expect(await countersOf(productId)).toEqual({ onHand: 10, reserved: 2, available: 8 });
        expect((await reservationRepository.findByOrderId(orderId))!.status).toBe('committed');
    });

    it('ends the hold released once the last unit is given back', async () => {
        const { orderId, productId } = await orderHolding(OrderStatus.paid);
        await inventoryService.commitForOrder(orderId);

        await withTransaction((session) =>
            releaseStock(orderId, [{ productId, quantity: 3 }], session)
        );

        expect((await reservationRepository.findByOrderId(orderId))!.status).toBe('released');
    });

    it('answers false when there is no open hold to take from', async () => {
        const order = await seedOrder(OrderStatus.paid);
        const product = await createProduct({ onHand: 10 });

        const released = await withTransaction((session) =>
            releaseStock(
                String(order._id),
                [{ productId: String(product._id), quantity: 1 }],
                session
            )
        );

        expect(released).toBe(false);
    });
});
