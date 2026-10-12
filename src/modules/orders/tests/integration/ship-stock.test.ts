/**
 * @module
 * Stock leaves the shelf when the goods do. A shipment takes ITS units off `onHand` in its own
 * transaction (`shipStock`), so a partly shipped order has partly left the shelf; the status moves
 * that follow report the fact and take nothing. The one status move that dispatches by itself is
 * the admin override past dispatch, which takes whatever has not left yet. Real Mongo throughout.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { seedOrder, seedDigitalOrder } from '@modules/orders/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { inventoryService } from '@modules/inventory';
import { OrderStatus, StockMovementReason } from '@types';
import { withTransaction } from '@infrastructure/runtime/database';
import { markShipped, markDelivered } from '../../services/status';
import { refreshShelf, shipStock } from '../../services/fulfillment';
import { overrideStatus } from '../../services/override';

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
});

/**
 * An order in `status` whose 3 units of a fresh product are held, then paid for (committed) —
 * the state every dispatch starts from.
 *
 * @param status - where the order stands
 * @param digital - whether the order is digital-only
 */
const paidOrderHolding = async (status: OrderStatus, digital = false) => {
    const product = await createProduct({ onHand: 10 });
    const order = await (digital ? seedDigitalOrder(status) : seedOrder(status));
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(product._id), quantity: 3 }
    ]);
    await inventoryService.commitForOrder(orderId);
    return { orderId, productId: String(product._id) };
};

/**
 * Whether the order's units are still claimed — true while the hold is held or committed, false
 * once it has shipped or been released.
 *
 * @param orderId - the order
 */
const stillClaimed = (orderId: string) => inventoryService.isStockBoundToOrder(orderId);

/**
 * How many `ship` rows the ledger holds for an order.
 *
 * @param productId - the product the order held
 */
const shipRows = (productId: string) =>
    inventoryService
        .listMovements({ productId, reason: StockMovementReason.ship })
        .then((page) => page.items.length);

describe('paying and processing', () => {
    it('leave the shelf count alone', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.paid);

        const result = await overrideStatus(
            orderId,
            OrderStatus.processing,
            'picking started by hand',
            callerContextAs('admin', 'admin-1')
        );

        expect(result.success).toBe(true);
        expect(await countersOf(productId)).toEqual({ onHand: 10, reserved: 3, available: 7 });
        expect(await stillClaimed(orderId)).toBe(true);
    });
});

describe('shipStock', () => {
    it('takes a shipment’s units off the shelf and leaves the rest of the hold', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.processing);

        await withTransaction((session) =>
            shipStock(orderId, [{ productId, quantity: 1 }], session)
        );
        // The catalogue's cache cannot roll back, so it is refreshed once the commit has landed.
        await refreshShelf([productId]);

        expect(await countersOf(productId)).toEqual({ onHand: 9, reserved: 2, available: 7 });
        expect(await stillClaimed(orderId)).toBe(true);
        expect(await shipRows(productId)).toBe(1);
    });

    it('ends the hold with the last unit, and the status moves take nothing more', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.processing);

        await withTransaction((session) =>
            shipStock(orderId, [{ productId, quantity: 3 }], session)
        );
        await refreshShelf([productId]);
        await markShipped(orderId);
        await markDelivered(orderId, new Date());

        expect(await countersOf(productId)).toEqual({ onHand: 7, reserved: 0, available: 7 });
        expect(await stillClaimed(orderId)).toBe(false);
        expect(await shipRows(productId)).toBe(1);
    });

    it('moves no stock when the caller’s transaction rolls back', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.processing);

        await expect(
            withTransaction((session) =>
                shipStock(orderId, [{ productId, quantity: 3 }], session).then(() => {
                    throw new Error('connection reset');
                })
            )
        ).rejects.toThrow('connection reset');

        expect(await countersOf(productId)).toEqual({ onHand: 10, reserved: 3, available: 7 });
        expect(await stillClaimed(orderId)).toBe(true);
    });
});

describe('the admin override', () => {
    it.each([OrderStatus.shipped, OrderStatus.delivered])(
        'takes the units off the shelf when it lands on %s',
        async (target) => {
            const { orderId, productId } = await paidOrderHolding(OrderStatus.paid);

            const result = await overrideStatus(
                orderId,
                target,
                'handed over at the counter',
                callerContextAs('admin', 'admin-1')
            );

            expect(result.success).toBe(true);
            expect(await countersOf(productId)).toEqual({ onHand: 7, reserved: 0, available: 7 });
            expect(await stillClaimed(orderId)).toBe(false);
        }
    );

    it('does not take them twice when it carries a shipped order on to delivered', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.shipped);
        await inventoryService.shipForOrder(orderId);

        await overrideStatus(
            orderId,
            OrderStatus.delivered,
            'carrier lost the scan',
            callerContextAs('admin', 'admin-1')
        );

        expect(await countersOf(productId)).toEqual({ onHand: 7, reserved: 0, available: 7 });
        expect(await shipRows(productId)).toBe(1);
    });

    it('takes only what has not shipped yet when some already left in a shipment', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.processing);
        await withTransaction((session) =>
            shipStock(orderId, [{ productId, quantity: 1 }], session)
        );

        await overrideStatus(
            orderId,
            OrderStatus.shipped,
            'the rest left too',
            callerContextAs('admin', 'admin-1')
        );

        expect(await countersOf(productId)).toEqual({ onHand: 7, reserved: 0, available: 7 });
        expect(await shipRows(productId)).toBe(2);
    });
});
