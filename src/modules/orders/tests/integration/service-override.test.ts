/**
 * @module
 * `orders/services/override.ts` — the admin override. Real Mongo throughout, same reasoning
 * `service-status.test.ts` already gives: the guarantee is the conditional write, and a mock
 * cannot race against itself.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import {
    seedOrder,
    seedDigitalOrder,
    readOrder,
    timelineOf
} from '@modules/orders/tests/factories';
import { withTransaction } from '@infrastructure/runtime/database';
import { overrideStatus } from '../../services/override';
import { recordForcedFulfilment } from '../../services/fulfillment';
import { orderModel } from '../../model';
import { ORDER_STATUS_CHANGED, ORDER_STATUS_OVERRIDDEN } from '../../events';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { OrderStatus } from '@types';

setupTestDb();

// The outbox relay only delivers in a process whose modules are subscribed.
beforeEach(() => markDomainEventsWired());

afterEach(() => resetDomainEvents());

describe('overrideStatus on a digital-only order', () => {
    it('refuses shipped: there is no parcel to have left', async () => {
        const order = await seedDigitalOrder(OrderStatus.processing);

        const result = await overrideStatus(
            String(order._id),
            OrderStatus.shipped,
            'nothing to ship',
            callerContextAs('admin', 'admin-1')
        );

        expect(result).toMatchObject({ success: false, status: 409 });
        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.processing);
    });

    it('counts the withdrawal period from payment when it lands on delivered', async () => {
        const order = await seedDigitalOrder(
            OrderStatus.processing,
            new Date('2026-03-01T10:00:00Z')
        );

        const result = await overrideStatus(
            String(order._id),
            OrderStatus.delivered,
            'fulfilled by hand',
            callerContextAs('admin', 'admin-1')
        );

        expect(result.success).toBe(true);
        const stored = await readOrder(String(order._id));
        expect(stored?.withdrawUntil?.toISOString()).toBe('2026-03-31T23:59:59.999Z');
    });
});

describe('overrideStatus', () => {
    it('moves an order forward, records the history entry, and fires the status-changed event', async () => {
        const order = await seedOrder(OrderStatus.paid);
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));
        const context = callerContextAs('admin', 'admin-1');

        const result = await overrideStatus(
            String(order._id),
            OrderStatus.processing,
            'shelf pick error, correcting by hand',
            context
        );

        expect(result.success).toBe(true);
        expect(result.data?.status).toBe(OrderStatus.processing);
        // `order.status_changed` stays the one every listener reads (`webhooks` filters on `to`
        // alone); the override announces itself separately, below.
        await settleOutboxNudges();
        expect(events).toEqual([
            {
                orderId: String(order._id),
                from: OrderStatus.paid,
                to: OrderStatus.processing
            }
        ]);

        const timeline = await timelineOf(String(order._id));
        expect(timeline).toHaveLength(1);
        expect(timeline[0]).toMatchObject({
            type: 'status_overridden',
            actor: 'admin-1',
            text: 'shelf pick error, correcting by hand',
            data: { from: OrderStatus.paid, to: OrderStatus.processing, mode: 'status' }
        });
    });

    it('refuses a move into paid — that destination stays system-only', async () => {
        const order = await seedOrder(OrderStatus.pending);
        const context = callerContextAs('admin', 'admin-1');

        const result = await overrideStatus(
            String(order._id),
            OrderStatus.paid,
            'trying anyway',
            context
        );

        expect(result.success).toBe(false);
    });

    it('refuses to move an order out of pending — only the offline-payment door does that', async () => {
        const order = await seedOrder(OrderStatus.pending);
        const context = callerContextAs('admin', 'admin-1');

        for (const to of [OrderStatus.processing, OrderStatus.shipped, OrderStatus.delivered]) {
            const result = await overrideStatus(String(order._id), to, 'trying anyway', context);
            expect(result.success).toBe(false);
        }

        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.pending);
    });

    it('refuses a backward move', async () => {
        const order = await seedOrder(OrderStatus.shipped);
        const context = callerContextAs('admin', 'admin-1');

        const result = await overrideStatus(
            String(order._id),
            OrderStatus.processing,
            'undo, please',
            context
        );

        expect(result.success).toBe(false);
    });

    it('creates no parcel-side effect — it is the status-only door', async () => {
        const order = await seedOrder(OrderStatus.processing);
        const context = callerContextAs('admin', 'admin-1');

        await overrideStatus(String(order._id), OrderStatus.shipped, 'manual correction', context);

        // No shipment record exists — only `delivery`'s doors create one.
        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.shipped);
    });
});

describe('the override event', () => {
    it('announces itself beside the status change, with the instant the deadline was counted from', async () => {
        const order = await seedOrder(OrderStatus.processing);
        const overridden: unknown[] = [];
        onDomainEvent(ORDER_STATUS_OVERRIDDEN, (payload) => overridden.push(payload));

        await overrideStatus(
            String(order._id),
            OrderStatus.delivered,
            'handed over at the counter',
            callerContextAs('admin', 'admin-1')
        );
        await settleOutboxNudges();

        const [row] = await timelineOf(String(order._id));
        expect(overridden).toEqual([
            {
                orderId: String(order._id),
                from: OrderStatus.processing,
                to: OrderStatus.delivered,
                at: row.at,
                mode: 'status'
            }
        ]);
    });

    it('is refused while units still await stock, and writes nothing', async () => {
        const order = await seedOrder(OrderStatus.processing);
        await orderModel
            .updateOne(
                { _id: order._id },
                {
                    fulfillment: {
                        shipped: false,
                        remaining: 2,
                        onHold: 2,
                        awaitingStock: 2,
                        undelivered: 0
                    }
                }
            )
            .exec();

        const toShipped = await overrideStatus(
            String(order._id),
            OrderStatus.shipped,
            'trying anyway',
            callerContextAs('admin', 'admin-1')
        );

        expect(toShipped).toMatchObject({ success: false, status: 409 });
        expect(toShipped.errors?.[0].code).toBe('ORDER_OVERRIDE_AWAITING_STOCK');
        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.processing);
        expect(await timelineOf(String(order._id))).toHaveLength(0);
    });

    it('still lets an order that awaits stock be moved to `processing`, which ships nothing', async () => {
        const order = await seedOrder(OrderStatus.paid);
        await orderModel
            .updateOne(
                { _id: order._id },
                {
                    fulfillment: {
                        shipped: false,
                        remaining: 1,
                        onHold: 1,
                        awaitingStock: 1,
                        undelivered: 0
                    }
                }
            )
            .exec();

        const result = await overrideStatus(
            String(order._id),
            OrderStatus.processing,
            'starting by hand',
            callerContextAs('admin', 'admin-1')
        );

        expect(result.success).toBe(true);
    });
});

describe('recordForcedFulfilment', () => {
    it('leaves a history row for a forced act, with the status the act left the order in', async () => {
        const order = await seedOrder(OrderStatus.processing);
        const at = new Date('2026-05-01T09:00:00Z');

        await withTransaction((session) =>
            recordForcedFulfilment(
                String(order._id),
                { reason: 'carrier confirmed', actorUserId: 'admin-1', at, from: OrderStatus.paid },
                session
            )
        );

        const stored = await readOrder(String(order._id));
        const timeline = await timelineOf(String(order._id));
        expect(timeline).toHaveLength(1);
        expect(timeline[0]).toMatchObject({
            type: 'status_overridden',
            text: 'carrier confirmed',
            actor: 'admin-1',
            at: at.toISOString(),
            data: { from: OrderStatus.paid, to: OrderStatus.processing, mode: 'forced' }
        });
        // A history row is not a move: the order stays where the act left it.
        expect(stored?.status).toBe(OrderStatus.processing);
    });

    it('answers null for an order that does not exist', async () => {
        const result = await withTransaction((session) =>
            recordForcedFulfilment(
                '65dcdec2b18ad5e4bd597f01',
                { reason: 'x', actorUserId: 'a', at: new Date(), from: OrderStatus.paid },
                session
            )
        );

        expect(result).toBeNull();
    });
});
