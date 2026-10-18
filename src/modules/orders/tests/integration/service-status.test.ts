/**
 * @module
 * `orders/services/status.ts` — the status moves other modules REPORT, never request. Real Mongo
 * throughout: the guarantee is the conditional write (`updateStatusIfIn`'s own `$in` filter), and a
 * mock cannot race against itself.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { seedOrder, seedDigitalOrder, readOrder } from '@modules/orders/tests/factories';
import { withEnvironmentOverrides } from '@tests/environment';
import {
    markPaid,
    markProcessing,
    markShipped,
    markDelivered,
    markFulfilmentComplete
} from '../../services/status';
import { orderService } from '../../services';
import { ORDER_STATUS_CHANGED } from '../../events';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { nudgeOutbox, outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { OrderStatus } from '@types';
import type { ClientSession } from 'mongoose';
import { withTransaction } from '@infrastructure/runtime/database';

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
        // flag and `services/remove.ts`'s hard-delete refusal both read this.
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

    it('freezes the two-year guarantee deadline beside it', async () => {
        const order = await seedOrder(OrderStatus.shipped);

        const updated = await markDelivered(String(order._id), new Date('2026-03-01T10:00:00Z'));

        expect(updated?.conformityUntil?.toISOString()).toBe('2028-03-08T23:59:59.999Z');
    });

    it('honours the shortest period a deployment may offer', () =>
        withEnvironmentOverrides({ NODE_WITHDRAWAL_PERIOD_DAYS: '21' }, async () => {
            const order = await seedOrder(OrderStatus.shipped);

            const updated = await markDelivered(
                String(order._id),
                new Date('2026-03-01T10:00:00Z')
            );

            expect(updated?.withdrawUntil?.toISOString()).toBe('2026-03-22T23:59:59.999Z');
        }));
});

/** Run one status door inside a transaction of its own, as `delivery`'s acts do. */
const inTransaction = <T>(door: (session: ClientSession) => Promise<T>): Promise<T> =>
    withTransaction(door);

describe('markFulfilmentComplete', () => {
    it('moves a physical order through shipped to delivered in one write, announcing both moves', async () => {
        const order = await seedOrder(OrderStatus.processing);
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));
        const at = new Date('2026-04-10T15:00:00Z');

        const updated = await inTransaction((session) =>
            markFulfilmentComplete(String(order._id), at, session)
        );
        // The caller of the session variant wakes the relay after its own commit.
        nudgeOutbox();
        await settleOutboxNudges();

        expect(updated?.status).toBe(OrderStatus.delivered);
        // The order only became complete at `at`: the clock counts from there.
        expect(updated?.withdrawUntil?.toISOString()).toBe('2026-05-10T23:59:59.999Z');
        expect(events).toEqual([
            { orderId: String(order._id), from: OrderStatus.processing, to: OrderStatus.shipped },
            { orderId: String(order._id), from: OrderStatus.shipped, to: OrderStatus.delivered }
        ]);
    });

    it('moves a digital-only order straight to delivered, announcing the one move, clock from payment', async () => {
        const order = await seedDigitalOrder(
            OrderStatus.processing,
            new Date('2026-03-01T10:00:00Z')
        );
        const events: unknown[] = [];
        onDomainEvent(ORDER_STATUS_CHANGED, (payload) => events.push(payload));

        const updated = await inTransaction((session) =>
            markFulfilmentComplete(String(order._id), new Date(), session)
        );
        nudgeOutbox();
        await settleOutboxNudges();

        expect(updated?.status).toBe(OrderStatus.delivered);
        expect(updated?.withdrawUntil?.toISOString()).toBe('2026-03-31T23:59:59.999Z');
        expect(events).toEqual([
            { orderId: String(order._id), from: OrderStatus.processing, to: OrderStatus.delivered }
        ]);
    });

    it.each([OrderStatus.paid, OrderStatus.shipped, OrderStatus.delivered])(
        'refuses an order that is %s, and announces nothing',
        async (status) => {
            const order = await seedOrder(status);

            const updated = await inTransaction((session) =>
                markFulfilmentComplete(String(order._id), new Date(), session)
            );

            expect(updated).toBeNull();
            expect(await outboxEventModel.countDocuments()).toBe(0);
        }
    );

    it('leaves the order where it was when the caller’s transaction rolls back', async () => {
        const order = await seedOrder(OrderStatus.processing);

        await expect(
            inTransaction((session) =>
                markFulfilmentComplete(String(order._id), new Date(), session).then(() => {
                    throw new Error('a later write of the act failed');
                })
            )
        ).rejects.toThrow('a later write of the act failed');

        expect(await readOrder(String(order._id)).then((one) => one?.status)).toBe(
            OrderStatus.processing
        );
        expect(await outboxEventModel.countDocuments()).toBe(0);
    });
});

describe('the doors that take the caller’s session', () => {
    it('markShipped commits and announces with the caller’s transaction, and not before it', async () => {
        const order = await seedOrder(OrderStatus.processing);

        const updated = await inTransaction((session) =>
            markShipped(String(order._id), session).then(async (moved) => {
                // Inside the transaction nothing is visible to anyone else yet.
                expect(await readOrder(String(order._id)).then((one) => one?.status)).toBe(
                    OrderStatus.processing
                );
                return moved;
            })
        );

        expect(updated?.status).toBe(OrderStatus.shipped);
        expect(await readOrder(String(order._id)).then((one) => one?.status)).toBe(
            OrderStatus.shipped
        );
        expect(await outboxEventModel.countDocuments({ name: ORDER_STATUS_CHANGED })).toBe(1);
    });

    it('markDelivered freezes the deadline from the arrival it is handed', async () => {
        const order = await seedOrder(OrderStatus.shipped);

        const updated = await inTransaction((session) =>
            markDelivered(String(order._id), new Date('2026-06-01T08:00:00Z'), session)
        );

        expect(updated?.withdrawUntil?.toISOString()).toBe('2026-07-01T23:59:59.999Z');
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
