/**
 * @module
 * Stock leaves the shelf when the goods do. Every move that dispatches an order — a parcel
 * handed over, a digital order fulfilled, an admin override past either — takes the order's units
 * off `onHand` in the status write's own transaction; nothing else does. Real Mongo throughout.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { seedOrder, seedDigitalOrder, readOrder } from '@modules/orders/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { inventoryService } from '@modules/inventory';
import { OrderStatus, StockMovementReason } from '@types';
import { markShipped, markDelivered, markFulfilled } from '../../services/status';
import { overrideStatus, forceMove } from '../../services/override';

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

describe('markShipped', () => {
    it('takes the units off the shelf with the status, and leaves availability alone', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.processing);

        const moved = await markShipped(orderId);

        expect(moved?.status).toBe(OrderStatus.shipped);
        expect(await countersOf(productId)).toEqual({ onHand: 7, reserved: 0, available: 7 });
        expect(await stillClaimed(orderId)).toBe(false);
        expect(await shipRows(productId)).toBe(1);
    });

    it('moves no stock when the status write loses the race', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.paid);

        // `paid` is not a legal `from`: the conditional write matches nothing.
        expect(await markShipped(orderId)).toBeNull();

        expect(await countersOf(productId)).toEqual({ onHand: 10, reserved: 3, available: 7 });
        expect(await stillClaimed(orderId)).toBe(true);
    });

    it('rolls the status back when anything in the same transaction throws', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.processing);
        const ship = inventoryService.shipForOrder;
        // The real shipment runs to completion, THEN throws: the counters already moved inside
        // the transaction, so only a rollback puts them back.
        jest.spyOn(inventoryService, 'shipForOrder').mockImplementationOnce(async (id, session) => {
            await ship(id, session);
            throw new Error('connection reset');
        });

        await expect(markShipped(orderId)).rejects.toThrow('connection reset');

        const stored = await readOrder(orderId);
        expect(stored?.status).toBe(OrderStatus.processing);
        expect(await countersOf(productId)).toEqual({ onHand: 10, reserved: 3, available: 7 });
        expect(await stillClaimed(orderId)).toBe(true);
    });
});

describe('markDelivered', () => {
    it('does not take the units a second time', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.processing);
        await markShipped(orderId);

        const moved = await markDelivered(orderId, new Date());

        expect(moved?.status).toBe(OrderStatus.delivered);
        expect(await countersOf(productId)).toEqual({ onHand: 7, reserved: 0, available: 7 });
        expect(await shipRows(productId)).toBe(1);
    });
});

describe('markFulfilled', () => {
    it('is a digital order’s dispatch: the units leave when it is delivered', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.processing, true);

        const moved = await markFulfilled(orderId);

        expect(moved?.status).toBe(OrderStatus.delivered);
        expect(await countersOf(productId)).toEqual({ onHand: 7, reserved: 0, available: 7 });
        expect(await stillClaimed(orderId)).toBe(false);
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

    it('is the same dispatch when delivery forces the move', async () => {
        const { orderId, productId } = await paidOrderHolding(OrderStatus.paid);

        const moved = await forceMove(
            orderId,
            'shipped',
            'skipping the processing step',
            callerContextAs('admin', 'admin-1')
        );

        expect(moved).toMatchObject({ status: OrderStatus.shipped });
        expect(await countersOf(productId)).toEqual({ onHand: 7, reserved: 0, available: 7 });
    });
});
