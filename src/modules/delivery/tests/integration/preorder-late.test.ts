/**
 * @module
 * A paid preorder whose date slips (PRODUCT_STATES P5), through the real doors: an admin moves the
 * release date and `delivery` tells the buyer; the daily sweep tells them once more when a date
 * passes with no stock. The shop only tells: it asks nothing, cancels nothing, and silence keeps the
 * buyer waiting.
 *
 * The notice, the state it leaves on the fulfillment order and the event are one transaction;
 * the email follows. Real Mongo and a real outbox, the mailer mocked at its queue.
 *
 * See: docs/modules/delivery.md#preorders-and-a-moved-date
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { asCustomer, testCallerContext } from '@tests/callers';
import { productService } from '@modules/products';
import { timelineOf } from '@modules/orders/tests/factories';
import { fulfillmentOrdersOf, paidPreorderOrder } from '@modules/delivery/tests/factories';
import { deliveryService } from '@modules/delivery/services';
import {
    presentExportFulfillmentOrder,
    presentPreorderFulfillmentOrder
} from '@modules/delivery/presenter';
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

/** One preorder of `quantity` units promised for `days` from now. */
const preorder = async (days = 30, quantity = 2) => {
    const placed = await paidPreorderOrder([{ quantity, releaseDate: inDays(days) }]);
    // As the paid listener would have: the fulfillment orders exist before anyone moves a date.
    await fulfillmentOrdersOf(placed.orderId);
    return placed;
};

/** What an admin does: change the product's release date, and let the outbox carry the news. */
const moveDate = async (productId: string, to: Date | null) => {
    await productService.updateById(
        productId,
        { releaseDate: to === null ? null : to.toISOString() },
        testCallerContext
    );
    await settleOutboxNudges();
};

/** The one waiting fulfillment order of an order. */
const waitingOf = async (orderId: string) => {
    const all = await fulfillmentOrdersOf(orderId);
    return all.find(({ holdReason }) => holdReason === 'awaiting_stock')!;
};

/** The status of the order's waiting fulfillment order. */
const statusOf = (orderId: string) => waitingOf(orderId).then(({ status }) => status);

/** The date the order's waiting fulfillment order is now expected. */
const expectedAtOf = (orderId: string) => waitingOf(orderId).then(({ expectedAt }) => expectedAt);

/** The `delayed` events written, in order. */
const delayedEvents = () =>
    outboxEventModel
        .find({ name: 'fulfillment_order.delayed' })
        .sort({ _id: 1 })
        .lean()
        .exec()
        .then((rows) => rows.map(({ payload }) => payload as Record<string, unknown>));

describe('a release date that moves', () => {
    it('tells the buyer of a later date and leaves them waiting, with the cancel open', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);

        await moveDate(productIds[0], inDays(40));

        const waiting = await waitingOf(orderId);
        expect(waiting.expectedAt?.getTime()).toBeGreaterThan(waiting.agreedAt!.getTime());
        expect(waiting.lastNoticeAt).toBeInstanceOf(Date);
        expect(waiting.status).toBe('on_hold');
        expect(await delayedEvents()).toMatchObject([
            { orderId, reason: 'moved', titles: expect.any(Array) }
        ]);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['a long slip', 75],
        ['a year', 365]
    ])('tells the buyer of %s the same way: nothing is asked', async (_name, days) => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);

        await moveDate(productIds[0], inDays(days));

        const [event] = await delayedEvents();
        expect(Object.keys(event).toSorted()).toEqual(
            [
                'agreedAt',
                'expectedAt',
                'fulfillmentOrderId',
                'orderId',
                'reason',
                'titles',
                'userId'
            ].toSorted()
        );
        expect(await statusOf(orderId)).toBe('on_hold');
    });

    it('tells the buyer of every later date, however many', async () => {
        const { orderId, productIds } = await preorder(30);
        await moveDate(productIds[0], inDays(35));
        await moveDate(productIds[0], inDays(37));
        await moveDate(productIds[0], inDays(90));

        expect(await delayedEvents()).toHaveLength(3);
        expect(await statusOf(orderId)).toBe('on_hold');
    });

    it('says nothing when the date moves earlier, and just follows it', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);

        await moveDate(productIds[0], inDays(10));

        const waiting = await waitingOf(orderId);
        expect(waiting.expectedAt!.getTime()).toBeLessThan(waiting.agreedAt!.getTime());
        expect(await delayedEvents()).toEqual([]);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('tells the buyer, with no new date, when the date is cleared', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);

        await moveDate(productIds[0], null);

        const waiting = await waitingOf(orderId);
        expect(waiting.expectedAt).toBeUndefined();
        const [event] = await delayedEvents();
        expect(event).toMatchObject({ reason: 'moved' });
        expect(event.expectedAt).toBeUndefined();
    });

    it('tells once when a cleared date is announced twice', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);
        await moveDate(productIds[0], null);

        await deliveryService.onDateChanged(productIds[0], 'preorder');

        expect(await delayedEvents()).toHaveLength(1);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        expect(await expectedAtOf(orderId)).toBeUndefined();
        expect(await typesOf(orderId)).toEqual([
            'fulfillment_held',
            'release_date_moved',
            'delay_notice_sent'
        ]);
    });

    it('tells the buyer of every later change, cleared dates included', async () => {
        const { orderId, productIds } = await preorder(30);
        await moveDate(productIds[0], null);
        await moveDate(productIds[0], inDays(40));
        await moveDate(productIds[0], null);

        // A date after a cleared one is followed quietly (good news); only the two clears tell.
        expect(await delayedEvents()).toHaveLength(2);
        expect(await expectedAtOf(orderId)).toBeUndefined();
    });

    it('tells the buyer, and drops the date, when one product of a group loses its date', async () => {
        const { orderId, productIds } = await paidPreorderOrder([
            { quantity: 1, releaseDate: inDays(30) },
            { quantity: 1, releaseDate: inDays(32) }
        ]);
        await fulfillmentOrdersOf(orderId);

        await moveDate(productIds[0], null);

        const waiting = await waitingOf(orderId);
        expect(waiting.expectedAt).toBeUndefined();
        expect(await delayedEvents()).toMatchObject([{ reason: 'moved' }]);
    });

    it('is harmless when the same move is announced twice', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);
        await moveDate(productIds[0], inDays(40));

        // A redelivery: the date is already the expected one.
        await deliveryService.onDateChanged(productIds[0], 'preorder');

        expect(await delayedEvents()).toHaveLength(1);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('leaves a fulfillment order that is no longer waiting alone', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);
        const { inventoryService } = await import('@modules/inventory');
        await inventoryService.receive(productIds[0], 2, undefined, testCallerContext);
        await settleOutboxNudges();

        await moveDate(productIds[0], inDays(90));

        expect(await delayedEvents()).toEqual([]);
    });
});

/** The three views of one fulfillment order, as the wire carries them. */
const viewsOf = async (orderId: string, userId: string) => {
    const stored = await waitingOf(orderId);
    const buyer = await deliveryService.getForOrder(orderId, asCustomer(userId));
    return {
        buyer: buyer.success ? buyer.data.fulfillmentOrders[0] : undefined,
        exported: presentExportFulfillmentOrder(stored),
        board: presentPreorderFulfillmentOrder(stored, undefined, false, new Date())
    };
};

describe('what the buyer, the export and the board see of a late preorder', () => {
    it('carries the date and the last notice, and nothing the buyer must answer', async () => {
        const { orderId, productIds, user } = await preorder(30);
        await moveDate(productIds[0], inDays(40));
        const { expectedAt } = await waitingOf(orderId);

        const { buyer, exported, board } = await viewsOf(orderId, user.id);

        for (const view of [buyer, exported, board]) {
            expect(view?.expectedAt).toBe(expectedAt!.toISOString());
            expect(view).not.toHaveProperty('consent');
            expect(view).not.toHaveProperty('consentDeadline');
            expect(view).not.toHaveProperty('revisedShipDate');
        }
        expect(buyer?.actions).not.toHaveProperty('confirmWait');
        expect(board).toMatchObject({ state: 'waiting' });
    });
});

describe('the daily sweep', () => {
    it('tells the buyer once about a date that came with no stock, and not again', async () => {
        const { orderId } = await preorder(30);
        await waitingOf(orderId);

        const first = await deliveryService.runPreorderSweep(inDays(31));
        const second = await deliveryService.runPreorderSweep(inDays(32));
        await settleOutboxNudges();

        expect([first, second]).toEqual([{ notified: 1 }, { notified: 0 }]);
        expect(await delayedEvents()).toMatchObject([{ reason: 'due' }]);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        // It told the buyer and nothing else: the order is still waiting.
        const waiting = await waitingOf(orderId);
        expect([waiting.status, waiting.cancelReason]).toEqual(['on_hold', undefined]);
    });

    it('waits for the date to pass: never before it', async () => {
        const { orderId } = await preorder(30);
        await waitingOf(orderId);

        const before = await deliveryService.runPreorderSweep(inDays(29));
        const after = await deliveryService.runPreorderSweep(inDays(30.5));
        await settleOutboxNudges();

        expect([before, after]).toEqual([{ notified: 0 }, { notified: 1 }]);
    });

    it('leaves a date still ahead alone', async () => {
        await preorder(30);

        expect(await deliveryService.runPreorderSweep(inDays(10))).toEqual({ notified: 0 });
    });

    it('does not tell about goods already allocated: that is the Late view', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);
        const { inventoryService } = await import('@modules/inventory');
        await inventoryService.receive(productIds[0], 2, undefined, testCallerContext);
        await settleOutboxNudges();

        expect(await deliveryService.runPreorderSweep(inDays(40))).toEqual({ notified: 0 });
    });

    it('tells again when a newer date passes, and not before', async () => {
        const { productIds } = await preorder(30);
        await deliveryService.runPreorderSweep(inDays(31));
        await moveDate(productIds[0], inDays(60));

        const early = await deliveryService.runPreorderSweep(inDays(45));
        const late = await deliveryService.runPreorderSweep(inDays(61));
        await settleOutboxNudges();

        expect([early, late]).toEqual([{ notified: 0 }, { notified: 1 }]);
        const events = await delayedEvents();
        expect(events.map((event) => event.reason)).toEqual(['due', 'moved', 'due']);
    });

    it('has nothing to say about a cleared date: the buyer was told, and none is expected', async () => {
        const { orderId, productIds } = await preorder(30);
        await moveDate(productIds[0], null);

        expect(await deliveryService.runPreorderSweep(inDays(400))).toEqual({ notified: 0 });
        expect(await statusOf(orderId)).toBe('on_hold');
    });

    it('never cancels, however long the buyer stays silent', async () => {
        const { orderId } = await preorder(30);
        await deliveryService.runPreorderSweep(inDays(31));

        await deliveryService.runPreorderSweep(inDays(400));

        const waiting = await waitingOf(orderId);
        expect([waiting.status, waiting.holdReason, waiting.cancelReason]).toEqual([
            'on_hold',
            'awaiting_stock',
            undefined
        ]);
        expect(await typesOf(orderId)).not.toContain('remainder_cancelled');
    });
});

describe('why a fulfillment order was cancelled', () => {
    it('says order when the whole order was cancelled', async () => {
        const { orderId } = await preorder(30);
        await waitingOf(orderId);
        await deliveryService.runPreorderSweep(inDays(31));

        await deliveryService.cancelAllForOrder(orderId);

        const [cancelled] = await fulfillmentOrdersOf(orderId);
        expect(cancelled.cancelReason).toBe('order');
    });
});

/** The `[type, data]` pairs of an order's timeline, born-held row and all. */
const trailOf = (orderId: string) =>
    timelineOf(orderId).then((rows) => rows.map(({ type, data }) => ({ type, data })));

/** The types alone. */
const typesOf = (orderId: string) => trailOf(orderId).then((rows) => rows.map(({ type }) => type));

describe('what the timeline says of a preorder', () => {
    it('says the order was born held, with the reason code', async () => {
        const { orderId } = await preorder(30);

        expect(await trailOf(orderId)).toMatchObject([
            { type: 'fulfillment_held', data: { reason: 'awaiting_stock' } }
        ]);
    });

    it('writes the move, then the notice, for a slip, and each only once', async () => {
        const { orderId, productIds } = await preorder(30);
        await moveDate(productIds[0], inDays(75));
        await deliveryService.onDateChanged(productIds[0], 'preorder');

        const rows = await trailOf(orderId);

        expect(rows.map(({ type }) => type)).toEqual([
            'fulfillment_held',
            'release_date_moved',
            'delay_notice_sent'
        ]);
        expect(rows[1].data).toMatchObject({ from: expect.any(String), to: expect.any(String) });
        expect(rows[2].data).toMatchObject({ reason: 'moved' });
        expect(rows[2].data).not.toHaveProperty('needsAnswer');
        expect(rows[2].data).not.toHaveProperty('answerBy');
    });

    it('writes only the move when the date goes earlier', async () => {
        const { orderId, productIds } = await preorder(30);
        await moveDate(productIds[0], inDays(10));

        expect(await typesOf(orderId)).toEqual(['fulfillment_held', 'release_date_moved']);
    });

    it('writes a null date when the date is cleared', async () => {
        const { orderId, productIds } = await preorder(30);
        await moveDate(productIds[0], null);

        const rows = await trailOf(orderId);

        expect(rows.map(({ type }) => type)).toEqual([
            'fulfillment_held',
            'release_date_moved',
            'delay_notice_sent'
        ]);
        expect(rows[1].data).toMatchObject({ to: null });
    });

    it("writes the sweep's notice once, as due", async () => {
        const { orderId } = await preorder(30);
        await deliveryService.runPreorderSweep(inDays(31));
        await deliveryService.runPreorderSweep(inDays(62));

        const rows = await trailOf(orderId);

        expect(rows.map(({ type }) => type)).toEqual(['fulfillment_held', 'delay_notice_sent']);
        expect(rows[1].data).toMatchObject({ reason: 'due' });
    });
});
