/**
 * @module
 * A paid preorder whose date slips (PRODUCT_STATES P5), through the real doors: an admin moves the
 * release date and `delivery` decides what the buyer is owed; the buyer answers; the daily sweep
 * asks about a date that passed and announces a wait that nobody answered.
 *
 * The notice, the state it leaves on the fulfillment order and the event are one transaction;
 * the email follows. Real Mongo and a real outbox, the mailer mocked at its queue.
 *
 * See: docs/modules/delivery.md#preorders-and-a-moved-date
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { asAdmin, asCustomer, testCallerContext } from '@tests/callers';
import { asReject } from '@tests/response';
import { productService } from '@modules/products';
import { fulfillmentOrdersOf, paidPreorderOrder } from '@modules/delivery/tests/factories';
import { getForOrder, runPreorderSweep, cancelAllForOrder } from '@modules/delivery/services';
import { confirmWait } from '@modules/delivery/services/confirm-wait';
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

/** The id of the waiting fulfillment order of an order. */
const waitingIdOf = (orderId: string) => waitingOf(orderId).then(({ _id }) => String(_id));

/** Where the buyer of the order's waiting fulfillment order stands. */
const consentOf = (orderId: string) => waitingOf(orderId).then(({ consent }) => consent);

/** The `delayed` events written, in order. */
const delayedEvents = () =>
    outboxEventModel
        .find({ name: 'fulfillment_order.delayed' })
        .sort({ _id: 1 })
        .lean()
        .exec()
        .then((rows) => rows.map(({ payload }) => payload as Record<string, unknown>));

/** The `wait_expired` events written. */
const expiredEvents = () =>
    outboxEventModel.find({ name: 'fulfillment_order.wait_expired' }).lean().exec();

describe('a release date that moves', () => {
    it('tells the buyer of a short first slip, offers cancel, and keeps them waiting', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);

        await moveDate(productIds[0], inDays(40));

        const waiting = await waitingOf(orderId);
        expect(waiting.expectedAt?.getTime()).toBeGreaterThan(waiting.agreedAt!.getTime());
        expect(waiting.slips).toBe(1);
        expect(waiting.consent).toBeUndefined();
        expect(waiting.lastNoticeAt).toBeInstanceOf(Date);
        expect(await delayedEvents()).toMatchObject([
            { orderId, needsAnswer: false, reason: 'moved', titles: expect.any(Array) }
        ]);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('asks a question when the slip is longer than 28 days, and opens the 30-day window', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);

        await moveDate(productIds[0], inDays(75));

        const waiting = await waitingOf(orderId);
        expect([waiting.consent, waiting.slips]).toEqual(['awaiting', 1]);
        const days = (waiting.consentDeadline!.getTime() - Date.now()) / DAY;
        expect(days).toBeGreaterThan(29.9);
        expect(days).toBeLessThanOrEqual(30);
        expect(await delayedEvents()).toMatchObject([{ needsAnswer: true }]);
    });

    it('asks again on a second slip, however small', async () => {
        const { orderId, productIds } = await preorder(30);
        await moveDate(productIds[0], inDays(35));
        await moveDate(productIds[0], inDays(37));

        const waiting = await waitingOf(orderId);

        expect([waiting.consent, waiting.slips]).toEqual(['awaiting', 2]);
        const events = await delayedEvents();
        expect(events.map((event) => event.needsAnswer)).toEqual([false, true]);
    });

    it('says nothing when the date moves earlier, and just follows it', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);

        await moveDate(productIds[0], inDays(10));

        const waiting = await waitingOf(orderId);
        expect(waiting.expectedAt!.getTime()).toBeLessThan(waiting.agreedAt!.getTime());
        expect(waiting.slips).toBe(0);
        expect(await delayedEvents()).toEqual([]);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('asks, with no new date, when the date is cleared', async () => {
        const { orderId, productIds } = await preorder(30);
        const before = await waitingOf(orderId);

        await moveDate(productIds[0], null);

        const waiting = await waitingOf(orderId);
        expect(waiting.consent).toBe('awaiting');
        expect(waiting.expectedAt?.toISOString()).toBe(before.expectedAt?.toISOString());
        const [event] = await delayedEvents();
        expect(event).toMatchObject({ needsAnswer: true });
        expect(event.expectedAt).toBeUndefined();
    });

    it('is harmless when the same move is announced twice', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);
        await moveDate(productIds[0], inDays(40));

        // A redelivery: the date is already the expected one.
        const { onReleaseDateChanged } = await import('@modules/delivery/services');
        await onReleaseDateChanged(productIds[0]);

        expect(await delayedEvents()).toHaveLength(1);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('leaves a fulfillment order that is no longer waiting alone', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);
        const { inventoryService } = await import('@modules/inventory');
        await inventoryService.receive(productIds[0], 2);
        await settleOutboxNudges();

        await moveDate(productIds[0], inDays(90));

        expect(await delayedEvents()).toEqual([]);
    });
});

describe('the buyer saying keep waiting', () => {
    it('confirms, and clears the deadline', async () => {
        const { orderId, productIds, user } = await preorder(30);
        await waitingOf(orderId);
        await moveDate(productIds[0], inDays(75));
        const waiting = await waitingOf(orderId);

        const answered = await confirmWait(
            String(waiting._id),
            asCustomer(user.id),
            testCallerContext
        );

        expect(answered.success).toBe(true);
        const after = await waitingOf(orderId);
        expect(after.consent).toBe('confirmed');
        expect(after.consentDeadline).toBeUndefined();
    });

    it('is refused when nobody asked', async () => {
        const { orderId, user } = await preorder(30);
        const waiting = await waitingOf(orderId);

        const answered = await confirmWait(
            String(waiting._id),
            asCustomer(user.id),
            testCallerContext
        );

        expect(asReject(answered).errors[0].code).toBe('DELIVERY_NOT_AWAITING_ANSWER');
    });

    it("is the order's own buyer's alone: a stranger finds nothing, staff are refused", async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);
        await moveDate(productIds[0], inDays(75));
        const waiting = await waitingOf(orderId);
        const stranger = await paidPreorderOrder(
            [{ quantity: 1, releaseDate: inDays(30) }],
            'stranger@example.com'
        );

        const byStranger = await confirmWait(
            String(waiting._id),
            asCustomer(stranger.user.id),
            testCallerContext
        );
        const byStaff = await confirmWait(String(waiting._id), asAdmin(), testCallerContext);

        expect(asReject(byStranger).status).toBe(404);
        expect(asReject(byStaff).status).toBe(403);
        expect(await consentOf(orderId)).toBe('awaiting');
    });

    it('shows the buyer the control, and only while the question stands', async () => {
        const { orderId, productIds, user } = await preorder(30);
        await waitingOf(orderId);
        const read = async () => {
            const result = await getForOrder(orderId, asCustomer(user.id));
            return result.success
                ? result.data.fulfillmentOrders[0].actions.confirmWait
                : undefined;
        };
        await moveDate(productIds[0], inDays(75));

        const asked = await read();
        await confirmWait(await waitingIdOf(orderId), asCustomer(user.id), testCallerContext);

        expect([asked, await read()]).toEqual([true, false]);
    });
});

describe('the daily sweep', () => {
    it('asks the buyer once about a date that passed with no stock, and not again', async () => {
        const { orderId } = await preorder(30);
        await waitingOf(orderId);
        const later = inDays(31);

        const first = await runPreorderSweep(later);
        const second = await runPreorderSweep(inDays(32));
        await settleOutboxNudges();

        expect([first, second]).toEqual([
            { asked: 1, expired: 0 },
            { asked: 0, expired: 0 }
        ]);
        expect(await consentOf(orderId)).toBe('awaiting');
        expect(await delayedEvents()).toMatchObject([{ reason: 'passed', needsAnswer: true }]);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('leaves a date still ahead alone', async () => {
        await preorder(30);

        expect(await runPreorderSweep(inDays(10))).toEqual({ asked: 0, expired: 0 });
    });

    it('does not ask about goods already allocated: that is the Late view, not a question', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);
        const { inventoryService } = await import('@modules/inventory');
        await inventoryService.receive(productIds[0], 2);
        await settleOutboxNudges();

        expect(await runPreorderSweep(inDays(40))).toEqual({ asked: 0, expired: 0 });
    });

    it('does not ask again after the buyer said keep waiting, until a newer date passes', async () => {
        const { orderId, user } = await preorder(30);
        await waitingOf(orderId);
        await runPreorderSweep(inDays(31));
        await confirmWait(await waitingIdOf(orderId), asCustomer(user.id), testCallerContext);

        expect(await runPreorderSweep(inDays(45))).toEqual({ asked: 0, expired: 0 });
    });

    it('announces a wait that ran 30 days without an answer, and only then', async () => {
        const { orderId } = await preorder(30);
        await waitingOf(orderId);
        await runPreorderSweep(inDays(31));

        const early = await runPreorderSweep(inDays(50));
        const due = await runPreorderSweep(inDays(62));

        expect([early.expired, due.expired]).toEqual([0, 1]);
        expect(await expiredEvents()).toHaveLength(1);
        expect(await consentOf(orderId)).toBe('expired');
    });

    it('announces an expired wait again each day, until its cancel lands', async () => {
        const { orderId } = await preorder(30);
        await waitingOf(orderId);
        await runPreorderSweep(inDays(31));
        await runPreorderSweep(inDays(62));

        const again = await runPreorderSweep(inDays(63));

        expect(again.expired).toBe(1);
        expect(await expiredEvents()).toHaveLength(2);
    });

    it('refuses a keep-waiting that comes after the window closed', async () => {
        const { orderId, user } = await preorder(30);
        await waitingOf(orderId);
        await runPreorderSweep(inDays(31));
        await runPreorderSweep(inDays(62));

        const late = await confirmWait(
            await waitingIdOf(orderId),
            asCustomer(user.id),
            testCallerContext
        );

        expect(asReject(late).errors[0].code).toBe('DELIVERY_NOT_AWAITING_ANSWER');
    });

    it('does not announce a wait the buyer answered', async () => {
        const { orderId, user } = await preorder(30);
        await waitingOf(orderId);
        await runPreorderSweep(inDays(31));
        await confirmWait(await waitingIdOf(orderId), asCustomer(user.id), testCallerContext);

        expect(await runPreorderSweep(inDays(70))).toEqual({ asked: 0, expired: 0 });
    });
});

describe('why a fulfillment order was cancelled', () => {
    it('says no_answer when the buyer was asked and the window closed, else order', async () => {
        const silent = await preorder(30);
        await waitingOf(silent.orderId);
        await runPreorderSweep(inDays(31));
        // The 30 days run out, and the sweep says so.
        await runPreorderSweep(inDays(62));
        const other = await paidPreorderOrder(
            [{ quantity: 1, releaseDate: inDays(60) }],
            'other@example.com'
        );
        await waitingOf(other.orderId);

        await cancelAllForOrder(silent.orderId);
        await cancelAllForOrder(other.orderId);

        const [silentOne] = await fulfillmentOrdersOf(silent.orderId);
        const [otherOne] = await fulfillmentOrdersOf(other.orderId);
        expect([silentOne.cancelReason, otherOne.cancelReason]).toEqual(['no_answer', 'order']);
    });
});
