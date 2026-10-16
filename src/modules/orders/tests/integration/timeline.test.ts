/**
 * @module
 * The order's timeline: each move leaves one row, in the transaction of the move that caused it,
 * and each reader sees the rows its audience allows. Real Mongo, through the service's public
 * door. See docs/modules/orders.md#the-timeline.
 */
import { withTransaction } from '@infrastructure/runtime/database';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, seedOrder, toOrderItem, timelineOf } from '@modules/orders/tests/factories';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { resetDomainEvents } from '@kernel/events';
import { userService } from '@modules/users';
import { OrderStatus } from '@types';
import { orderService } from '../../services';
import { withdrawUntilFrom } from '../../domain';
import { orderEventModel } from '../../model';

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
    resetDomainEvents();
});

/** A second, third… buyer's order: the fixture default email is taken once per test. */
const orderOfBuyer = async (n: number, status: OrderStatus, extras: { digital?: boolean } = {}) => {
    const user = await createUser({ email: `buyer-${n}@example.com`, username: `buyer-${n}` });
    const product = await createProduct({
        sku: `SKU-${n}`,
        ...(extras.digital ? { requiresShipping: false } : {})
    });
    return createOrder(user, [toOrderItem(product, 1)], { status });
};

/** An instant this many days back. */
const daysAgo = (days: number): Date => new Date(Date.now() - days * 86_400_000);

/** The types of a timeline, in order. */
const typesOf = (rows: readonly { type: string }[]): string[] => rows.map(({ type }) => type);

describe('what each move writes', () => {
    it('opens with `created` when the order is placed', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 10 });

        const created = await orderService.create(
            user.id,
            user.email,
            [{ productId: String(product._id), quantity: 1 }],
            callerContextAs('admin')
        );

        expect(typesOf(await timelineOf(String(created.data?._id)))).toEqual(['created']);
    });

    it('writes one row per move down the lifecycle, naming the person behind it', async () => {
        const order = await seedOrder(OrderStatus.pending);
        const id = String(order._id);

        await orderService.markPaid(id, 'card', { actor: 'cashier-1', method: 'cash' });
        await orderService.markProcessing(id, undefined, 'admin-1');
        await orderService.markShipped(id, undefined, 'admin-1');
        await orderService.markDelivered(
            id,
            new Date('2026-05-01T09:00:00Z'),
            undefined,
            'admin-2'
        );

        const rows = await timelineOf(id);
        expect(rows.map(({ type, actor }) => [type, actor])).toEqual([
            ['paid', 'cashier-1'],
            ['processing', 'admin-1'],
            ['shipped', 'admin-1'],
            ['delivered', 'admin-2']
        ]);
        expect(rows[0].data).toEqual({ method: 'cash' });
        expect(rows[3].data).toEqual({
            withdrawUntil: withdrawUntilFrom(new Date('2026-05-01T09:00:00Z'), 30).toISOString()
        });
    });

    it('writes `shipped` then `delivered` for a physical order that completes in one act, `delivered` alone for a digital one', async () => {
        const physical = await orderOfBuyer(1, OrderStatus.processing);
        const digital = await orderOfBuyer(2, OrderStatus.processing, { digital: true });

        await withTransaction((session) =>
            orderService.markFulfilmentComplete(String(physical._id), new Date(), session)
        );
        await withTransaction((session) =>
            orderService.markFulfilmentComplete(String(digital._id), new Date(), session)
        );

        expect(typesOf(await timelineOf(String(physical._id)))).toEqual(['shipped', 'delivered']);
        expect(typesOf(await timelineOf(String(digital._id)))).toEqual(['delivered']);
    });

    it('writes nothing for a move that lost its race', async () => {
        const order = await seedOrder(OrderStatus.cancelled);

        expect(await orderService.markPaid(String(order._id))).toBeNull();

        expect(await timelineOf(String(order._id))).toEqual([]);
    });

    it('rolls its row back with the move when the move`s event cannot be written', async () => {
        const order = await seedOrder(OrderStatus.pending);
        jest.spyOn(outboxEventModel, 'create').mockRejectedValueOnce(new Error('disk full'));

        await expect(orderService.markPaid(String(order._id))).rejects.toThrow('disk full');

        expect(await timelineOf(String(order._id))).toEqual([]);
    });

    it('records who cancelled: the buyer by their own id, the sweep by no one', async () => {
        const user = await createUser();
        const product = await createProduct();
        const mine = await createOrder(user, [toOrderItem(product, 1)]);
        const swept = await orderOfBuyer(1, OrderStatus.pending);

        await orderService.cancelOnRequestById(String(mine._id), asCustomer(user.id));
        await orderService.cancelForErasureById(String(swept._id));

        expect(await timelineOf(String(mine._id))).toMatchObject([
            { type: 'cancelled', actor: user.id, data: { by: 'customer' } }
        ]);
        const [sweep] = await timelineOf(String(swept._id));
        expect(sweep).toMatchObject({ type: 'cancelled', data: { by: 'system' } });
        expect(sweep).not.toHaveProperty('actor');
    });

    it('writes the override with its reason as staff text, in the move`s transaction', async () => {
        const order = await seedOrder(OrderStatus.paid);

        await orderService.overrideStatus(
            String(order._id),
            OrderStatus.processing,
            'shelf pick error',
            callerContextAs('admin', 'admin-1')
        );

        expect(await timelineOf(String(order._id))).toMatchObject([
            {
                type: 'status_overridden',
                actor: 'admin-1',
                text: 'shelf pick error',
                data: { mode: 'status', from: OrderStatus.paid, to: OrderStatus.processing }
            }
        ]);
    });
});

describe('who reads what', () => {
    it('shows the buyer the buyer-visible rows without an actor, and staff every row with it', async () => {
        const order = await seedOrder(OrderStatus.pending);
        const id = String(order._id);
        await orderService.markPaid(id, 'card', { actor: 'cashier-1' });
        await orderService.overrideStatus(
            id,
            OrderStatus.processing,
            'correcting by hand',
            callerContextAs('admin', 'admin-1')
        );

        const staff = await orderService.readTimeline(id, asAdmin());
        const buyer = await orderService.readTimeline(id, asCustomer('someone'));

        expect(typesOf(staff)).toEqual(['paid', 'status_overridden']);
        expect(staff[0].actor).toBe('cashier-1');
        // The override is staff-only whole, so the buyer's view holds the payment alone.
        expect(typesOf(buyer)).toEqual(['paid']);
        expect(buyer[0]).not.toHaveProperty('actor');
    });

    it('keeps the buyer from reading staff text on any row', async () => {
        const order = await seedOrder(OrderStatus.paid);
        await orderService.overrideStatus(
            String(order._id),
            OrderStatus.processing,
            'private reason',
            callerContextAs('admin', 'admin-1')
        );

        const buyer = await orderService.readTimeline(String(order._id), asCustomer('someone'));

        expect(JSON.stringify(buyer)).not.toContain('private reason');
    });
});

describe('what the law lets go', () => {
    it('clears the actor of an erased account on every row, and keeps the rows', async () => {
        registerCheckoutModules();
        const staff = await createUser({ email: 'staff@example.com', username: 'staff' });
        const order = await seedOrder(OrderStatus.paid);
        await orderService.overrideStatus(
            String(order._id),
            OrderStatus.processing,
            'reason',
            callerContextAs('admin', staff.id)
        );

        await userService.remove(staff, true);

        const [row] = await timelineOf(String(order._id));
        expect(row.type).toBe('status_overridden');
        expect(row).not.toHaveProperty('actor');
    });

    it('unsets staff text past its own window, once, and keeps the row', async () => {
        setEnvironment({ NODE_ORDER_EVENT_TEXT_RETENTION_DAYS: '10' });
        const order = await seedOrder(OrderStatus.paid);
        const id = String(order._id);
        await withTransaction(async (session) => {
            await orderService.appendTimeline(
                id,
                { type: 'status_overridden', text: 'old', at: daysAgo(11) },
                session
            );
            await orderService.appendTimeline(
                id,
                { type: 'status_overridden', text: 'recent', at: daysAgo(9) },
                session
            );
        });

        expect(await orderService.scrubTimelineText()).toBe(1);
        expect(await orderService.scrubTimelineText()).toBe(0);

        const rows = await timelineOf(id);
        expect(rows.map((row) => row.text)).toEqual([undefined, 'recent']);
        expect(rows).toHaveLength(2);
    });

    it('removes the timeline with an order that is hard-deleted', async () => {
        const order = await seedOrder(OrderStatus.pending);
        await orderService.cancelForErasureById(String(order._id));
        await settleOutboxNudges();

        await orderService.removeById(String(order._id), true);

        expect(await orderEventModel.countDocuments({ orderId: order._id })).toBe(0);
    });
});

describe('the buyer`s data export', () => {
    it('carries every row of the account`s own orders, staff text and actor included, and no one else`s', async () => {
        const user = await createUser();
        const product = await createProduct();
        const mine = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });
        const theirs = await orderOfBuyer(1, OrderStatus.paid);
        for (const order of [mine, theirs])
            await orderService.overrideStatus(
                String(order._id),
                OrderStatus.processing,
                'visible to the owner',
                callerContextAs('admin', 'admin-1')
            );

        const exported = await orderService.collectTimelineOf(user.id);

        expect(exported).toMatchObject([
            {
                orderId: String(mine._id),
                type: 'status_overridden',
                actor: 'admin-1',
                text: 'visible to the owner'
            }
        ]);
    });
});
