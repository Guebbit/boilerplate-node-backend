/**
 * @module
 * A paid backorder through delivery: the grouping rule reads what the order froze, the shelf part
 * ships now and the owed part waits `on_hold` for stock under its promise, and a moved restock
 * date tells the buyers who were promised that date what the law owes them. An order promised the
 * 30-day default is left alone.
 *
 * Real inventory and a real outbox, the mailer mocked at its queue.
 *
 * See: docs/modules/delivery.md#preorders-and-a-moved-date
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { testCallerContext } from '@tests/callers';
import { productService } from '@modules/products';
import { inventoryService } from '@modules/inventory';
import { fulfillmentOrdersOf, paidBackorderOrder } from '@modules/delivery/tests/factories';
import { deliveryService } from '@modules/delivery/services';
import deliveryModule from '@modules/delivery/module';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { markDomainEventsWired, resetDomainEvents } from '@kernel/events';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = jest.mocked(enqueueEmail);

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    deliveryModule.subscribe();
    markDomainEventsWired();
});

afterEach(() => {
    resetDomainEvents();
    jest.clearAllMocks();
});

const DAY = 86_400_000;

/** A date `days` from now. */
const inDays = (days: number): Date => new Date(Date.now() + days * DAY);

/** What an admin does: change the product's restock date, and let the outbox carry the news. */
const moveRestockDate = async (productId: string, to: Date | null) => {
    await productService.updateById(
        productId,
        { restockDate: to === null ? null : to.toISOString() },
        testCallerContext
    );
    await settleOutboxNudges();
};

/** The one fulfillment order of an order that waits for stock. */
const waitingOf = async (orderId: string) => {
    const all = await fulfillmentOrdersOf(orderId);
    return all.find(({ holdReason }) => holdReason === 'awaiting_stock')!;
};

/** The `delayed` events written, in order. */
const delayedEvents = () =>
    outboxEventModel
        .find({ name: 'fulfillment_order.delayed' })
        .sort({ _id: 1 })
        .lean()
        .exec()
        .then((rows) => rows.map(({ payload }) => payload as Record<string, unknown>));

describe('grouping a paid backorder', () => {
    it('ships the shelf part now and holds the owed part, promised the date the buyer saw', async () => {
        const restockDate = inDays(20);
        const { orderId } = await paidBackorderOrder({ quantity: 3, shelf: 2, restockDate });

        const all = await fulfillmentOrdersOf(orderId);

        expect(all.map(({ number, status }) => [number, status])).toEqual([
            [1, 'open'],
            [2, 'on_hold']
        ]);
        expect(all[0].lines[0]).toMatchObject({ quantity: 2 });
        expect(all[1]).toMatchObject({
            holdReason: 'awaiting_stock',
            cause: 'backorder'
        });
        expect(all[1].lines[0]).toMatchObject({ quantity: 1 });
        expect(all[1].agreedAt?.toISOString()).toBe(restockDate.toISOString());
        expect(all[1].defaulted).toBeUndefined();
    });

    it('marks a promise that was the 30-day default', async () => {
        const { orderId } = await paidBackorderOrder({ quantity: 1, shelf: 0 });

        const waiting = await waitingOf(orderId);

        expect(waiting.defaulted).toBe(true);
        const days = (waiting.agreedAt!.getTime() - Date.now()) / DAY;
        expect(days).toBeGreaterThan(29.9);
        expect(days).toBeLessThanOrEqual(30);
    });

    it('holds nothing when the shelf covered the whole line', async () => {
        const { orderId } = await paidBackorderOrder({ quantity: 2, shelf: 5 });

        const all = await fulfillmentOrdersOf(orderId);

        expect(all.map(({ status }) => status)).toEqual(['open']);
    });
});

describe('the daily sweep', () => {
    it('tells a buyer promised the 30-day default once it has passed, and not earlier', async () => {
        const { orderId } = await paidBackorderOrder({ quantity: 1, shelf: 0 });
        await waitingOf(orderId);

        const early = await deliveryService.runPreorderSweep(inDays(28.5));
        const due = await deliveryService.runPreorderSweep(inDays(30.5));
        await settleOutboxNudges();

        expect([early, due]).toEqual([{ notified: 0 }, { notified: 1 }]);
        const stillWaiting = await waitingOf(orderId);
        expect(stillWaiting.status).toBe('on_hold');
        expect(await delayedEvents()).toMatchObject([{ orderId, reason: 'due' }]);
    });
});

describe('stock arriving for a paid backorder', () => {
    it('releases the owed part when the delivery covers it', async () => {
        const { orderId, productId } = await paidBackorderOrder({
            quantity: 3,
            shelf: 1,
            restockDate: inDays(20)
        });
        await fulfillmentOrdersOf(orderId);

        await inventoryService.receive(productId, 2, undefined, testCallerContext);
        await settleOutboxNudges();

        const all = await fulfillmentOrdersOf(orderId);
        expect(all.map(({ status }) => status)).toEqual(['open', 'open']);
    });
});

describe('a restock date that moves', () => {
    it('tells the buyer of a later date and keeps them waiting', async () => {
        const { orderId, productId } = await paidBackorderOrder({
            quantity: 1,
            shelf: 0,
            restockDate: inDays(20)
        });
        await waitingOf(orderId);

        await moveRestockDate(productId, inDays(30));

        const waiting = await waitingOf(orderId);
        expect(waiting.status).toBe('on_hold');
        expect(await delayedEvents()).toMatchObject([{ orderId, reason: 'moved' }]);
    });

    it('tells the buyer, with no new date, when the date is cleared', async () => {
        const { orderId, productId } = await paidBackorderOrder({
            quantity: 1,
            shelf: 0,
            restockDate: inDays(20)
        });
        await waitingOf(orderId);

        await moveRestockDate(productId, null);

        const waiting = await waitingOf(orderId);
        expect(waiting.expectedAt).toBeUndefined();
        expect(await delayedEvents()).toMatchObject([{ reason: 'moved' }]);
    });

    it('leaves a buyer promised the 30-day default alone, whatever the catalogue does', async () => {
        const { orderId, productId } = await paidBackorderOrder({ quantity: 1, shelf: 0 });
        const before = await waitingOf(orderId);

        await moveRestockDate(productId, inDays(120));
        await moveRestockDate(productId, null);

        const after = await waitingOf(orderId);
        expect(after.expectedAt?.toISOString()).toBe(before.expectedAt?.toISOString());
        expect(await delayedEvents()).toEqual([]);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('does not tell a preorder buyer about a restock date, nor the other way round', async () => {
        const { orderId, productId } = await paidBackorderOrder({
            quantity: 1,
            shelf: 0,
            restockDate: inDays(20)
        });
        await waitingOf(orderId);

        await productService.updateById(
            productId,
            { releaseDate: inDays(5).toISOString() },
            testCallerContext
        );
        await settleOutboxNudges();

        expect(await delayedEvents()).toEqual([]);
    });
});
