/**
 * @module
 * `orders/services/status.ts` — the status moves other modules REPORT, never request. Real Mongo
 * throughout: the guarantee is the conditional write (`updateStatusIfIn`'s own `$in` filter), and a
 * mock cannot race against itself.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { seedOrder, readOrder, createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { withEnvironment } from '@tests/environment';
import {
    markPaid,
    markProcessing,
    markShipped,
    markDelivered,
    markFulfilled
} from '../../services/status';
import { orderService } from '../../services';
import { orderModel } from '../../model';
import { ORDER_STATUS_CHANGED } from '../../events';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { OrderStatus } from '@types';

setupTestDb();

// The outbox relay only delivers in a process whose modules are subscribed.
beforeEach(() => markDomainEventsWired());

afterEach(() => resetDomainEvents());

describe('markPaid', () => {
    it('moves a pending order to paid and announces it once', async () => {
        const order = await seedOrder(OrderStatus.pending);
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));

        const updated = await markPaid(String(order._id));

        expect(updated?.status).toBe(OrderStatus.paid);
        // Stamped in the SAME write as the status move — `services/scope.ts`'s `invoice` action
        // flag and `services/crud.ts`'s hard-delete refusal both read this.
        expect(updated?.paidAt).toBeInstanceOf(Date);
        await expect(readOrder(String(order._id))).resolves.toHaveProperty('status', 'paid');
        await settleOutboxNudges();
        expect(events).toEqual([
            { orderId: String(order._id), from: OrderStatus.pending, to: OrderStatus.paid }
        ]);
    });

    it.each([OrderStatus.paid, OrderStatus.processing, OrderStatus.cancelled])(
        'refuses and announces nothing from %s',
        async (status) => {
            const order = await seedOrder(status);
            const events: unknown[] = [];
            onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));

            const updated = await markPaid(String(order._id));

            expect(updated).toBeNull();
            await settleOutboxNudges();
            expect(events).toEqual([]);
        }
    );
});

describe('markProcessing', () => {
    it('moves a paid order to processing and announces it once', async () => {
        const order = await seedOrder(OrderStatus.paid);
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));

        const updated = await markProcessing(String(order._id));

        expect(updated?.status).toBe(OrderStatus.processing);
        await settleOutboxNudges();
        expect(events).toEqual([
            { orderId: String(order._id), from: OrderStatus.paid, to: OrderStatus.processing }
        ]);
    });

    it('refuses from pending — an order must be paid first', async () => {
        const order = await seedOrder(OrderStatus.pending);

        const updated = await markProcessing(String(order._id));

        expect(updated).toBeNull();
    });

    it('is reachable on the service object, like its siblings', async () => {
        const order = await seedOrder(OrderStatus.paid);

        const updated = await orderService.markProcessing(String(order._id));

        expect(updated?.status).toBe(OrderStatus.processing);
    });
});

describe('markShipped', () => {
    it('moves a processing order to shipped and announces it once', async () => {
        const order = await seedOrder(OrderStatus.processing);
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));

        const updated = await markShipped(String(order._id));

        expect(updated?.status).toBe(OrderStatus.shipped);
        await settleOutboxNudges();
        expect(events).toEqual([
            { orderId: String(order._id), from: OrderStatus.processing, to: OrderStatus.shipped }
        ]);
    });

    it('refuses from paid — an order must be processing first', async () => {
        const order = await seedOrder(OrderStatus.paid);

        const updated = await markShipped(String(order._id));

        expect(updated).toBeNull();
    });
});

describe('markDelivered', () => {
    it('moves a shipped order to delivered and announces it once', async () => {
        const order = await seedOrder(OrderStatus.shipped);
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));

        const updated = await markDelivered(String(order._id), new Date());

        expect(updated?.status).toBe(OrderStatus.delivered);
        await settleOutboxNudges();
        expect(events).toEqual([
            { orderId: String(order._id), from: OrderStatus.shipped, to: OrderStatus.delivered }
        ]);
    });

    it('refuses from processing — a parcel must be shipped first', async () => {
        const order = await seedOrder(OrderStatus.processing);

        const updated = await markDelivered(String(order._id), new Date());

        expect(updated).toBeNull();
    });

    it('freezes the withdrawal deadline at the end of the 30th day after the delivery it was told about', async () => {
        const order = await seedOrder(OrderStatus.shipped);

        const updated = await markDelivered(String(order._id), new Date('2026-03-01T10:00:00Z'));

        expect(updated?.withdrawUntil?.toISOString()).toBe('2026-03-31T23:59:59.999Z');
    });

    it('honours the shortest period a deployment may offer', () =>
        withEnvironment('NODE_WITHDRAWAL_PERIOD_DAYS', '21', async () => {
            const order = await seedOrder(OrderStatus.shipped);

            const updated = await markDelivered(
                String(order._id),
                new Date('2026-03-01T10:00:00Z')
            );

            expect(updated?.withdrawUntil?.toISOString()).toBe('2026-03-22T23:59:59.999Z');
        }));
});

describe('markFulfilled', () => {
    it('moves a processing order straight to delivered and announces it once', async () => {
        const order = await seedOrder(OrderStatus.processing);
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));

        const updated = await markFulfilled(String(order._id));

        expect(updated?.status).toBe(OrderStatus.delivered);
        await settleOutboxNudges();
        expect(events).toEqual([
            { orderId: String(order._id), from: OrderStatus.processing, to: OrderStatus.delivered }
        ]);
    });

    it("counts a digital order's withdrawal period from payment, not from fulfilment", async () => {
        const user = await createUser();
        const product = await createProduct({ requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });
        await orderModel.updateOne(
            { _id: order._id },
            { paidAt: new Date('2026-03-01T10:00:00Z') }
        );

        const updated = await markFulfilled(String(order._id));

        expect(updated?.withdrawUntil?.toISOString()).toBe('2026-03-31T23:59:59.999Z');
    });

    it('refuses from paid — the digital-only door still needs `start` first', async () => {
        const order = await seedOrder(OrderStatus.paid);

        const updated = await markFulfilled(String(order._id));

        expect(updated).toBeNull();
    });

    // `markDelivered`'s own edge into `delivered` is `shipped`, not `processing` — the two must
    // stay independent, or one door's move would silently also satisfy the other's gate.
    it("never satisfies markDelivered's own gate — the two edges into `delivered` stay independent", async () => {
        const order = await seedOrder(OrderStatus.processing);

        await markFulfilled(String(order._id));
        const viaShippedDoor = await markDelivered(String(order._id), new Date());

        expect(viaShippedDoor).toBeNull();
    });
});

describe('two callers racing the same move', () => {
    it('lands the write, and fires the event, exactly once', async () => {
        const order = await seedOrder(OrderStatus.pending);
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));

        const [first, second] = await Promise.all([
            markPaid(String(order._id)),
            markPaid(String(order._id))
        ]);

        // Exactly one of the two racing calls sees the document it moved.
        expect([first, second].filter(Boolean)).toHaveLength(1);
        await settleOutboxNudges();
        expect(events).toHaveLength(1);
    });
});
