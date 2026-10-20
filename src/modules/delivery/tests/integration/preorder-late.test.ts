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
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { asReject } from '@tests/response';
import { productService } from '@modules/products';
import { timelineOf } from '@modules/orders/tests/factories';
import {
    fulfillmentOrdersOf,
    paidPreorderOrder,
    setFulfillmentOrderState
} from '@modules/delivery/tests/factories';
import { deliveryService } from '@modules/delivery/services';
import {
    presentExportFulfillmentOrder,
    presentPreorderFulfillmentOrder
} from '@modules/delivery/presenter';
import { confirmWait } from '@modules/delivery/services/confirm-wait';
import deliveryModule from '@modules/delivery/module';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { markDomainEventsWired, resetDomainEvents } from '@kernel/events';
import { endOfDayInZone } from '@domain-primitives/time';
import { shopTimezone } from '@modules/shop';

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
        // Silence is consent to the new date (16 CFR 435.2 (b)(1)(ii)): it is on record as agreed.
        expect(waiting.revisedShipDate).toEqual(waiting.expectedAt);
        expect(waiting.lastNoticeAt).toBeInstanceOf(Date);
        expect(await delayedEvents()).toMatchObject([
            { orderId, needsAnswer: false, reason: 'moved', titles: expect.any(Array) }
        ]);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('asks a question when the slip is longer than 28 days, and ends the window 28 days past the promise', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);

        await moveDate(productIds[0], inDays(75));

        const waiting = await waitingOf(orderId);
        expect([waiting.consent, waiting.slips]).toEqual(['awaiting', 1]);
        // The rule's own end, not a count from today: the promise (30 days out) plus 28 calendar
        // days, to the end of that shop-zone day. A fixed 30 days from now would close it a month early.
        expect(waiting.consentDeadline).toEqual(
            endOfDayInZone(waiting.agreedAt!, shopTimezone(), 28)
        );
        // The date the question offers is on record while it is open.
        expect(waiting.revisedShipDate).toEqual(waiting.expectedAt);
        const events = await delayedEvents();
        expect(events).toMatchObject([{ needsAnswer: true }]);
        // A first question follows from no earlier agreement.
        expect(events[0]).not.toHaveProperty('acceptedUntil');
    });

    it('keeps the answer deadline at 28 days past the promise when the move comes after it', async () => {
        const { orderId, productIds } = await preorder(30);
        const promised = inDays(-10);
        await setFulfillmentOrderState(await waitingIdOf(orderId), { agreedAt: promised });

        await moveDate(productIds[0], inDays(75));

        const waiting = await waitingOf(orderId);
        expect(waiting.consent).toBe('awaiting');
        expect(waiting.consentDeadline).toEqual(
            endOfDayInZone(new Date(promised.getTime() + 28 * DAY), shopTimezone())
        );
    });

    it('does not cut an early question short: it stays open to the promise plus 28 days', async () => {
        const { orderId, productIds } = await preorder(60);

        await moveDate(productIds[0], inDays(150));

        const waiting = await waitingOf(orderId);
        expect(waiting.consent).toBe('awaiting');
        // About day 88, not day 30: a buyer told two months ahead keeps the time the rule gives.
        expect(waiting.consentDeadline).toEqual(
            endOfDayInZone(waiting.agreedAt!, shopTimezone(), 28)
        );
        expect(waiting.consentDeadline!.getTime() - Date.now()).toBeGreaterThan(80 * DAY);
    });

    it('takes a silent short delay as consent to its date, so a later question ends there', async () => {
        const { orderId, productIds } = await preorder(30);
        await moveDate(productIds[0], inDays(40));
        const silent = await waitingOf(orderId);

        await moveDate(productIds[0], inDays(55));

        const waiting = await waitingOf(orderId);
        expect(waiting.consent).toBe('awaiting');
        // Not the promise plus 28 (day 58): silence cancels at the date already consented to.
        expect(waiting.consentDeadline).toEqual(
            endOfDayInZone(silent.revisedShipDate!, shopTimezone())
        );
    });

    it('keeps the date a buyer accepted when the date later moves earlier', async () => {
        const { orderId, productIds } = await preorder(30);
        await moveDate(productIds[0], inDays(40));
        const silent = await waitingOf(orderId);

        await moveDate(productIds[0], inDays(35));

        const waiting = await waitingOf(orderId);
        expect(waiting.expectedAt!.getTime()).toBeLessThan(silent.expectedAt!.getTime());
        expect(waiting.revisedShipDate).toEqual(silent.revisedShipDate);
    });

    it.each([
        ['a cleared date', null],
        ['a date that passed with no newer one', 'passed']
    ] as const)(
        'tells, and never asks, about every later date after an open-ended yes: %s',
        async (_name, how) => {
            const { orderId, productIds, user } = await preorder(30);
            if (how === null) await moveDate(productIds[0], null);
            else await deliveryService.runPreorderSweep(inDays(31));
            const asked = await waitingOf(orderId);
            expect(asked.consent).toBe('awaiting');
            // A question that offers no date records none, so a "yes" to it has no end date.
            expect(asked.revisedShipDate).toBeUndefined();
            await confirmWait(String(asked._id), asCustomer(user.id), testCallerContext);
            const yes = await waitingOf(orderId);
            expect(yes.consent).toBe('confirmed');
            expect(yes.revisedShipDate).toBeUndefined();
            const questions = await delayedEvents().then((all) => all.length);

            await moveDate(productIds[0], inDays(200));
            const first = await waitingOf(orderId);
            await moveDate(productIds[0], inDays(260));
            const second = await waitingOf(orderId);
            await moveDate(productIds[0], inDays(240));
            const earlier = await waitingOf(orderId);
            await deliveryService.runPreorderSweep(inDays(245));

            // Two notices, each with the cancel option and no deadline; the earlier move is silent.
            const events = await delayedEvents().then((all) => all.slice(questions));
            expect(events).toMatchObject([{ needsAnswer: false }, { needsAnswer: false }]);
            for (const state of [first, second, earlier]) {
                expect(state.consent).toBe('confirmed');
                expect(state.consentDeadline).toBeUndefined();
                expect(state.revisedShipDate).toBeUndefined();
            }
            expect(earlier.expectedAt!.getTime()).toBeLessThan(second.expectedAt!.getTime());
            expect(await consentOf(orderId)).toBe('confirmed');
        }
    );

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
        await waitingOf(orderId);

        await moveDate(productIds[0], null);

        const waiting = await waitingOf(orderId);
        expect(waiting.consent).toBe('awaiting');
        expect(waiting.expectedAt).toBeUndefined();
        const [event] = await delayedEvents();
        expect(event).toMatchObject({ needsAnswer: true });
        expect(event.expectedAt).toBeUndefined();
    });

    it('asks once when a cleared date is announced twice', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);
        await moveDate(productIds[0], null);
        const first = await waitingOf(orderId);

        await deliveryService.onDateChanged(productIds[0], 'preorder');

        const waiting = await waitingOf(orderId);
        expect(await delayedEvents()).toHaveLength(1);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        expect(waiting.slips).toBe(1);
        expect(waiting.consentDeadline?.toISOString()).toBe(first.consentDeadline?.toISOString());
        expect(waiting.expectedAt).toBeUndefined();
        expect(await typesOf(orderId)).toEqual([
            'fulfillment_held',
            'release_date_moved',
            'delay_notice_sent'
        ]);
    });

    it('keeps a buyer who said keep waiting confirmed when a cleared date is redelivered', async () => {
        const { orderId, productIds, user } = await preorder(30);
        await moveDate(productIds[0], null);
        await confirmWait(await waitingIdOf(orderId), asCustomer(user.id), testCallerContext);

        await deliveryService.onDateChanged(productIds[0], 'preorder');

        expect(await consentOf(orderId)).toBe('confirmed');
        expect(await delayedEvents()).toHaveLength(1);
    });

    it('asks again on every later slip, cleared dates included', async () => {
        const { orderId, productIds } = await preorder(30);
        await moveDate(productIds[0], null);
        await moveDate(productIds[0], inDays(40));
        await moveDate(productIds[0], null);

        const waiting = await waitingOf(orderId);

        expect(waiting.slips).toBe(2);
        expect(waiting.expectedAt).toBeUndefined();
        const events = await delayedEvents();
        expect(events.map((event) => event.needsAnswer)).toEqual([true, true]);
    });

    it('does not ask again, once the buyer agreed to an open-ended wait, when the sweep runs', async () => {
        const { orderId, productIds, user } = await preorder(30);
        await moveDate(productIds[0], null);
        await confirmWait(await waitingIdOf(orderId), asCustomer(user.id), testCallerContext);

        await deliveryService.runPreorderSweep(inDays(31));

        expect(await delayedEvents()).toHaveLength(1);
        expect(await consentOf(orderId)).toBe('confirmed');
    });

    it('asks, and drops the date, when one product of a group loses its date', async () => {
        const { orderId, productIds } = await paidPreorderOrder([
            { quantity: 1, releaseDate: inDays(30) },
            { quantity: 1, releaseDate: inDays(32) }
        ]);
        await fulfillmentOrdersOf(orderId);

        await moveDate(productIds[0], null);

        const waiting = await waitingOf(orderId);
        expect(waiting.consent).toBe('awaiting');
        expect(waiting.expectedAt).toBeUndefined();
        expect(await delayedEvents()).toMatchObject([{ needsAnswer: true }]);
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

    it('audits a staff member answering for a buyer as forbidden', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);
        await moveDate(productIds[0], inDays(75));
        const waiting = await waitingOf(orderId);
        const audited: AuditEntry[] = [];
        registerAuditSink((entry) => audited.push(entry));

        await confirmWait(String(waiting._id), asAdmin(), testCallerContext);

        expect(audited).toEqual([
            expect.objectContaining({
                action: 'security.forbidden',
                outcome: 'failure',
                targetType: 'order',
                targetId: orderId,
                metadata: { reason: 'not_the_buyer' }
            })
        ]);
    });

    it('shows the buyer the control, and only while the question stands', async () => {
        const { orderId, productIds, user } = await preorder(30);
        await waitingOf(orderId);
        const read = async () => {
            const result = await deliveryService.getForOrder(orderId, asCustomer(user.id));
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

describe('the revised ship date, as the buyer, the export and the board see it', () => {
    it('carries the date a silent short delay was taken to agree to', async () => {
        const { orderId, productIds, user } = await preorder(30);
        await moveDate(productIds[0], inDays(40));
        const { expectedAt } = await waitingOf(orderId);

        const { buyer, exported, board } = await viewsOf(orderId, user.id);

        for (const view of [buyer, exported, board])
            expect(view?.revisedShipDate).toBe(expectedAt!.toISOString());
    });

    it('carries the date an open question offers, and keeps it once the buyer says yes', async () => {
        const { orderId, productIds, user } = await preorder(30);
        await moveDate(productIds[0], inDays(75));
        const { expectedAt } = await waitingOf(orderId);
        await confirmWait(await waitingIdOf(orderId), asCustomer(user.id), testCallerContext);

        const { buyer } = await viewsOf(orderId, user.id);

        expect(buyer).toMatchObject({
            consent: 'confirmed',
            revisedShipDate: expectedAt!.toISOString()
        });
    });

    it('is absent for an open-ended yes: the buyer agreed to wait with no end date', async () => {
        const { orderId, productIds, user } = await preorder(30);
        await moveDate(productIds[0], null);
        await confirmWait(await waitingIdOf(orderId), asCustomer(user.id), testCallerContext);

        const { buyer, exported, board } = await viewsOf(orderId, user.id);

        expect(buyer).toMatchObject({ consent: 'confirmed' });
        for (const view of [buyer, exported, board])
            expect(view).not.toHaveProperty('revisedShipDate');
    });
});

describe('the daily sweep', () => {
    it('asks the buyer once about a date that came with no stock, and not again', async () => {
        const { orderId } = await preorder(30);
        await waitingOf(orderId);
        const later = inDays(31);

        const first = await deliveryService.runPreorderSweep(later);
        const second = await deliveryService.runPreorderSweep(inDays(32));
        await settleOutboxNudges();

        expect([first, second]).toEqual([
            { asked: 1, expired: 0 },
            { asked: 0, expired: 0 }
        ]);
        expect(await consentOf(orderId)).toBe('awaiting');
        expect(await delayedEvents()).toMatchObject([{ reason: 'due', needsAnswer: true }]);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('asks two days BEFORE the date, never after: the offer must not come later than the promise', async () => {
        const { orderId } = await preorder(30);
        await waitingOf(orderId);

        const early = await deliveryService.runPreorderSweep(inDays(27.5));
        const margin = await deliveryService.runPreorderSweep(inDays(28.5));
        await settleOutboxNudges();

        expect([early, margin]).toEqual([
            { asked: 0, expired: 0 },
            { asked: 1, expired: 0 }
        ]);
        expect(await consentOf(orderId)).toBe('awaiting');
    });

    it('leaves a date still ahead alone', async () => {
        await preorder(30);

        expect(await deliveryService.runPreorderSweep(inDays(10))).toEqual({
            asked: 0,
            expired: 0
        });
    });

    it('does not ask about goods already allocated: that is the Late view, not a question', async () => {
        const { orderId, productIds } = await preorder(30);
        await waitingOf(orderId);
        const { inventoryService } = await import('@modules/inventory');
        await inventoryService.receive(productIds[0], 2, undefined, testCallerContext);
        await settleOutboxNudges();

        expect(await deliveryService.runPreorderSweep(inDays(40))).toEqual({
            asked: 0,
            expired: 0
        });
    });

    it('does not ask again after the buyer said keep waiting, until a newer date passes', async () => {
        const { orderId, user } = await preorder(30);
        await waitingOf(orderId);
        await deliveryService.runPreorderSweep(inDays(31));
        await confirmWait(await waitingIdOf(orderId), asCustomer(user.id), testCallerContext);

        expect(await deliveryService.runPreorderSweep(inDays(45))).toEqual({
            asked: 0,
            expired: 0
        });
    });

    it('asks a renewed question 14 days ahead, and silence cancels at the date the buyer accepted', async () => {
        const { orderId } = await preorder(30);
        const waitingId = await waitingIdOf(orderId);
        const accepted = inDays(20);
        await setFulfillmentOrderState(waitingId, {
            agreedAt: inDays(-40),
            expectedAt: accepted,
            revisedShipDate: accepted,
            consent: 'confirmed',
            lastNoticeAt: inDays(-30)
        });

        const early = await deliveryService.runPreorderSweep(inDays(5));
        const renewed = await deliveryService.runPreorderSweep(inDays(7));

        expect([early.asked, renewed.asked]).toEqual([0, 1]);
        const waiting = await waitingOf(orderId);
        expect(waiting.consent).toBe('awaiting');
        expect(waiting.consentDeadline).toEqual(endOfDayInZone(accepted, shopTimezone()));
        // The mail names what the question follows from: the date the buyer agreed to.
        const events = await delayedEvents();
        expect(events.at(-1)).toMatchObject({ acceptedUntil: accepted.toISOString() });
    });

    it('announces a wait that ran 30 days without an answer, and only then', async () => {
        const { orderId } = await preorder(30);
        await waitingOf(orderId);
        await deliveryService.runPreorderSweep(inDays(31));

        const early = await deliveryService.runPreorderSweep(inDays(50));
        const due = await deliveryService.runPreorderSweep(inDays(62));

        expect([early.expired, due.expired]).toEqual([0, 1]);
        expect(await expiredEvents()).toHaveLength(1);
        expect(await consentOf(orderId)).toBe('expired');
    });

    it('announces an expired wait again each day, until its cancel lands', async () => {
        const { orderId } = await preorder(30);
        await waitingOf(orderId);
        await deliveryService.runPreorderSweep(inDays(31));
        await deliveryService.runPreorderSweep(inDays(62));

        const again = await deliveryService.runPreorderSweep(inDays(63));

        expect(again.expired).toBe(1);
        expect(await expiredEvents()).toHaveLength(2);
    });

    it('refuses a keep-waiting after the printed deadline, even before the sweep marks it', async () => {
        const { orderId, user } = await preorder(30);
        const waitingId = await waitingIdOf(orderId);
        // Asked, and the end of the day the mail printed has just gone: the sweep has not run.
        await setFulfillmentOrderState(waitingId, {
            consent: 'awaiting',
            consentDeadline: new Date(Date.now() - 1)
        });

        const late = await confirmWait(waitingId, asCustomer(user.id), testCallerContext);

        expect(asReject(late).errors[0].code).toBe('DELIVERY_NOT_AWAITING_ANSWER');
        expect(asReject(late).status).toBe(409);
        expect(await consentOf(orderId)).toBe('awaiting');
    });

    it('hears a keep-waiting on the printed day itself, up to its last millisecond', async () => {
        const { orderId, user } = await preorder(30);
        const waitingId = await waitingIdOf(orderId);
        await setFulfillmentOrderState(waitingId, {
            consent: 'awaiting',
            consentDeadline: endOfDayInZone(new Date(), shopTimezone())
        });

        const answered = await confirmWait(waitingId, asCustomer(user.id), testCallerContext);

        expect(answered.success).toBe(true);
        expect(await consentOf(orderId)).toBe('confirmed');
    });

    it('refuses a keep-waiting that comes after the window closed', async () => {
        const { orderId, user } = await preorder(30);
        await waitingOf(orderId);
        await deliveryService.runPreorderSweep(inDays(31));
        await deliveryService.runPreorderSweep(inDays(62));

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
        await deliveryService.runPreorderSweep(inDays(31));
        await confirmWait(await waitingIdOf(orderId), asCustomer(user.id), testCallerContext);

        expect(await deliveryService.runPreorderSweep(inDays(70))).toEqual({
            asked: 0,
            expired: 0
        });
    });
});

describe('why a fulfillment order was cancelled', () => {
    it('says no_answer when the buyer was asked and the window closed, else order', async () => {
        const silent = await preorder(30);
        await waitingOf(silent.orderId);
        await deliveryService.runPreorderSweep(inDays(31));
        // The 30 days run out, and the sweep says so.
        await deliveryService.runPreorderSweep(inDays(62));
        const other = await paidPreorderOrder(
            [{ quantity: 1, releaseDate: inDays(60) }],
            'other@example.com'
        );
        await waitingOf(other.orderId);

        await deliveryService.cancelAllForOrder(silent.orderId);
        await deliveryService.cancelAllForOrder(other.orderId);

        const [silentOne] = await fulfillmentOrdersOf(silent.orderId);
        const [otherOne] = await fulfillmentOrdersOf(other.orderId);
        expect([silentOne.cancelReason, otherOne.cancelReason]).toEqual(['no_answer', 'order']);
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
        expect(rows[2].data).toMatchObject({ reason: 'moved', needsAnswer: true });
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

    it('writes wait_confirmed, by the buyer', async () => {
        const { orderId, productIds, user } = await preorder(30);
        await moveDate(productIds[0], inDays(75));
        await confirmWait(await waitingIdOf(orderId), asCustomer(user.id), testCallerContext);

        const rows = await timelineOf(orderId);
        const confirmed = rows.at(-1);

        expect(confirmed).toMatchObject({ type: 'wait_confirmed' });
        expect(String(confirmed?.actor)).toBe(user.id);
    });

    it('writes wait_expired when the buyer stayed silent', async () => {
        const { orderId } = await preorder(30);
        await deliveryService.runPreorderSweep(inDays(31));
        await deliveryService.runPreorderSweep(inDays(62));

        const types = await typesOf(orderId);

        expect(types.slice(-2)).toEqual(['delay_notice_sent', 'wait_expired']);
    });
});
