/**
 * @module
 * The order events ride the transactional outbox: the row commits with the write it announces or
 * not at all. Each door that moves an order is proved twice — the event row appears with a write
 * that landed, and an event that cannot be written takes the write down with it. Real Mongo.
 * See docs/tools/outbox.md.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    seedOrder,
    readOrder,
    countOrders,
    toOrderItem
} from '@modules/orders/tests/factories';
import { callerContextAs, asCustomer, testCallerContext } from '@tests/callers';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { orderService } from '../../services';
import { overrideStatus } from '../../services/override';
import { ORDER_CANCELLED, ORDER_CREATED, ORDER_STATUS_CHANGED } from '../../events';
import { OrderStatus } from '@types';

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
});

/** Make the next outbox write fail, as a database that dies mid-transaction would. */
const failNextOutboxWrite = (): void => {
    jest.spyOn(outboxEventModel, 'create').mockRejectedValueOnce(new Error('disk full'));
};

/** The outbox rows of one event name, oldest first. */
const rowsNamed = (name: string) => outboxEventModel.find({ name }).sort({ _id: 1 }).lean();

/** One real order for a real buyer, through the door that writes it. */
const place = async () => {
    const user = await createUser();
    const product = await createProduct({ onHand: 10 });
    return orderService.create(
        user.id,
        user.email,
        [{ productId: String(product._id), quantity: 1 }],
        testCallerContext
    );
};

/** A pending order of a fresh buyer, who is the one cancelling it. */
const pendingOrderOfBuyer = async () => {
    const user = await createUser();
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)]);
    return { user, order };
};

describe('a status move reported to orders', () => {
    it('writes order.status_changed with the move, keyed by the order', async () => {
        const order = await seedOrder(OrderStatus.pending);

        await orderService.markPaid(String(order._id));
        await settleOutboxNudges();

        const rows = await rowsNamed(ORDER_STATUS_CHANGED);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            aggregateId: String(order._id),
            payload: { orderId: String(order._id), from: 'pending', to: 'paid' }
        });
    });

    it('writes no event for a move that lost its race', async () => {
        const order = await seedOrder(OrderStatus.cancelled);

        expect(await orderService.markPaid(String(order._id))).toBeNull();
        await settleOutboxNudges();

        expect(await outboxEventModel.countDocuments()).toBe(0);
    });

    it.each([
        ['markPaid', OrderStatus.pending, (id: string) => orderService.markPaid(id)],
        ['markProcessing', OrderStatus.paid, (id: string) => orderService.markProcessing(id)],
        ['markShipped', OrderStatus.processing, (id: string) => orderService.markShipped(id)],
        [
            'markDelivered',
            OrderStatus.shipped,
            (id: string) => orderService.markDelivered(id, new Date())
        ],
        ['markFulfilled', OrderStatus.processing, (id: string) => orderService.markFulfilled(id)]
    ])(
        '%s leaves the order where it was when its event cannot be written',
        async (_, from, move) => {
            const order = await seedOrder(from);
            failNextOutboxWrite();

            await expect(move(String(order._id))).rejects.toThrow('disk full');

            const stored = await readOrder(String(order._id));
            expect(stored?.status).toBe(from);
            expect(await outboxEventModel.countDocuments()).toBe(0);
        }
    );
});

describe('an admin override', () => {
    it('writes order.status_changed with the move', async () => {
        const order = await seedOrder(OrderStatus.paid);

        await overrideStatus(
            String(order._id),
            OrderStatus.processing,
            'correcting by hand',
            callerContextAs('admin', 'admin-1')
        );
        await settleOutboxNudges();

        expect(await rowsNamed(ORDER_STATUS_CHANGED)).toHaveLength(1);
    });

    it('leaves the order and its history untouched when its event cannot be written', async () => {
        const order = await seedOrder(OrderStatus.paid);
        failNextOutboxWrite();

        await expect(
            overrideStatus(
                String(order._id),
                OrderStatus.processing,
                'correcting by hand',
                callerContextAs('admin', 'admin-1')
            )
        ).rejects.toThrow('disk full');

        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.paid);
        expect(stored?.statusOverrides ?? []).toHaveLength(0);
    });
});

describe('placing an order', () => {
    it('writes order.created with the order', async () => {
        const created = await place();
        await settleOutboxNudges();

        const rows = await rowsNamed(ORDER_CREATED);
        expect(rows).toHaveLength(1);
        expect(rows[0].payload).toEqual({ orderId: String(created.data?._id) });
    });

    it('writes no order when its event cannot be written', async () => {
        failNextOutboxWrite();

        await expect(place()).rejects.toThrow('disk full');

        expect(await countOrders()).toBe(0);
        expect(await outboxEventModel.countDocuments()).toBe(0);
    });
});

describe('cancelling an order', () => {
    it('writes order.cancelled with the cancel, carrying whether a refund is owed', async () => {
        const { user, order } = await pendingOrderOfBuyer();

        await orderService.cancelById(String(order._id), asCustomer(user.id));
        await settleOutboxNudges();

        const rows = await rowsNamed(ORDER_CANCELLED);
        expect(rows).toHaveLength(1);
        expect(rows[0].payload).toEqual({ orderId: String(order._id), refund: true });
    });

    it('does not cancel when its event cannot be written', async () => {
        const { user, order } = await pendingOrderOfBuyer();
        failNextOutboxWrite();

        await expect(
            orderService.cancelById(String(order._id), asCustomer(user.id))
        ).rejects.toThrow('disk full');

        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.pending);
        expect(await outboxEventModel.countDocuments()).toBe(0);
    });
});
