/**
 * @module
 * `orders/services/status.ts` — the status moves other modules REPORT, never request. Real Mongo
 * throughout: the guarantee is the conditional write (`updateStatusIfIn`'s own `$in` filter), and a
 * mock cannot race against itself.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { seedOrder, readOrder } from '@modules/orders/tests/factories';
import { markPaid, markShipped, markDelivered } from '../../services/status';
import { ORDER_STATUS_CHANGED } from '../../events';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { OrderStatus } from '@types';

setupTestDb();

afterEach(() => resetDomainEvents());

describe('markPaid', () => {
    it('moves a pending order to paid and announces it once', async () => {
        const order = await seedOrder(OrderStatus.pending);
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));

        const updated = await markPaid(String(order._id));

        expect(updated?.status).toBe(OrderStatus.paid);
        await expect(readOrder(String(order._id))).resolves.toHaveProperty('status', 'paid');
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
            expect(events).toEqual([]);
        }
    );
});

describe('markShipped', () => {
    it('moves a processing order to shipped and announces it once', async () => {
        const order = await seedOrder(OrderStatus.processing);
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));

        const updated = await markShipped(String(order._id));

        expect(updated?.status).toBe(OrderStatus.shipped);
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

        const updated = await markDelivered(String(order._id));

        expect(updated?.status).toBe(OrderStatus.delivered);
        expect(events).toEqual([
            { orderId: String(order._id), from: OrderStatus.shipped, to: OrderStatus.delivered }
        ]);
    });

    it('refuses from processing — a parcel must be shipped first', async () => {
        const order = await seedOrder(OrderStatus.processing);

        const updated = await markDelivered(String(order._id));

        expect(updated).toBeNull();
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
        expect(events).toHaveLength(1);
    });
});
