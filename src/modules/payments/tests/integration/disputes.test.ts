/**
 * @module
 * The buyer's bank disputes a card payment. The provider's delivery is stored on the payment, ordered
 * by its own `observedAt`, announced, put on the order's staff timeline and shown on the attention
 * list; an open chargeback closes the refund door, a lost one takes its amount off what can be
 * refunded, and none of it is a refund (no `payment.refunded`, no credit note, no order change).
 * Real Mongo, the fake provider's dispute lever, through the services' public door.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem, timelineOf } from '@modules/orders/tests/factories';
import { orderService } from '@modules/orders';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { paymentService } from '@modules/payments/services';
import { deliver } from '@modules/payments/tests/deliver';
import { registerPaymentProvider } from '@modules/payments/providers/registry';
import { paymentRepository } from '@modules/payments/repository';
import {
    PAYMENT_DISPUTE_OPENED,
    PAYMENT_DISPUTE_UPDATED,
    PAYMENT_REFUNDED,
    PAYMENT_REFUND_OWED_AFTER_DISPUTE
} from '@modules/payments/events';
import { paymentModel } from '@modules/payments/model';
import paymentsModule from '@modules/payments/module';
import { fakePaymentProvider, setFakeDispute } from '@scenarios/support/doubles/payments/fake';
import type { ProviderDisputeState } from '@modules/payments/providers';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asReject } from '@tests/response';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import { withEnvironmentOverrides } from '@tests/environment';
import { payByCard, refundForOrder, refundOrderPayment } from '@modules/payments/tests/factories';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** Makes each buyer's address unique within a test. */
let buyers = 0;

/** The first instant every test's reports are measured from. */
const START = Date.parse('2026-10-01T10:00:00.000Z');

/** The instant `minutes` after {@link START}: the provider's own clock for a report. */
const when = (minutes: number): Date => new Date(START + minutes * 60_000);

/** The same instant as the ISO string a delivery carries. */
const at = (minutes: number): string => when(minutes).toISOString();

/** A card payment of 100.00 (one product at 50.00, two units), by a buyer with a unique address. */
const paidOrder = async () => {
    const user = await createUser({ email: `buyer-${String(buyers++)}@example.com` });
    const product = await createProduct({ price: '50.00' });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    await payByCard(order, user);
    await settleOutboxNudges();
    const orderId = String(order._id);
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment?.providerRef) throw new Error('no payment');
    return { orderId, providerRef: payment.providerRef };
};

/** What the provider says about dispute `dp_1`, overridable per report. */
const report = (over: Partial<ProviderDisputeState> = {}): ProviderDisputeState => ({
    disputeRef: 'dp_1',
    kind: 'chargeback',
    status: 'needs_response',
    reason: 'fraudulent',
    amount: '100.00',
    currency: 'EUR',
    fundsWithdrawn: true,
    evidenceDueBy: at(7 * 24 * 60),
    observedAt: at(0),
    ...over
});

/** Deliver one dispute report the way the webhook route hands it to the service. */
const deliverReport = (providerRef: string, over: Partial<ProviderDisputeState> = {}) =>
    deliver(setFakeDispute(providerRef, report(over)));

/** The payment as the shop's staff read it. */
const staffView = (orderId: string) =>
    paymentService.getForOrder(orderId, asAdmin()).then((answer) => answer.data);

/** How many outbox rows of one event exist. */
const events = (name: string) => outboxEventModel.countDocuments({ name });

/** The operator asking to refund `amount` of the order's payment. */
const refund = (orderId: string, amount?: string) =>
    refundOrderPayment(
        orderId,
        asAdmin(),
        callerContextAs('admin'),
        amount === undefined ? undefined : { amount }
    );

describe('a dispute is reported', () => {
    it('is stored, announced once, on the staff timeline, and not a refund', async () => {
        const { orderId, providerRef } = await paidOrder();
        const before = await orderService.getById(orderId);

        await deliverReport(providerRef);

        const view = await staffView(orderId);
        expect(view?.disputes).toEqual([
            expect.objectContaining({
                disputeRef: 'dp_1',
                kind: 'chargeback',
                status: 'needs_response',
                amount: '100.00',
                fundsWithdrawn: true,
                openedAt: when(0).toISOString(),
                evidenceDueBy: when(7 * 24 * 60).toISOString()
            })
        ]);
        // Separate from the display label: Shopify keeps `displayFinancialStatus` apart too.
        expect(view?.displayStatus).toBe('succeeded');
        await settleOutboxNudges();
        expect(await events(PAYMENT_DISPUTE_OPENED)).toBe(1);
        expect(await events(PAYMENT_DISPUTE_UPDATED)).toBe(0);
        expect(await events(PAYMENT_REFUNDED)).toBe(0);
        const rows = await timelineOf(orderId, 'dispute_');
        expect(rows.map(({ type }) => type)).toEqual(['dispute_opened']);
        // The order is untouched: a chargeback changes no status and credits nothing.
        const after = await orderService.getById(orderId);
        expect(after?.status).toBe(before?.status);
        expect(after?.paymentStatus).toBe(before?.paymentStatus);
    });

    it('is shown to staff alone, never to the payer', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        const payment = await paymentRepository.findByOrderId(orderId);

        const payer = await paymentService.getForOrder(
            orderId,
            asCustomer(String(payment?.userId))
        );

        expect(payer.data?.disputes).toBeUndefined();
        expect(payer.data?.refunds).toEqual([]);
    });

    it('ignores a report older than the stored one, and announces nothing for a repeat', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef, { status: 'under_review', observedAt: at(30) });

        await deliverReport(providerRef, { status: 'needs_response', observedAt: at(10) });
        await deliverReport(providerRef, { status: 'under_review', observedAt: at(30) });

        const view = await staffView(orderId);
        expect(view?.disputes?.[0]).toMatchObject({
            status: 'under_review',
            observedAt: when(30).toISOString()
        });
        await settleOutboxNudges();
        expect(await events(PAYMENT_DISPUTE_OPENED)).toBe(1);
        expect(await events(PAYMENT_DISPUTE_UPDATED)).toBe(0);
    });

    it('applies a newer report as an update, and closes the timeline once', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);

        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });
        await deliverReport(providerRef, { status: 'lost', observedAt: at(61) });

        const view = await staffView(orderId);
        expect(view?.disputes?.[0]).toMatchObject({
            status: 'lost',
            closedAt: when(61).toISOString()
        });
        await settleOutboxNudges();
        expect(await events(PAYMENT_DISPUTE_UPDATED)).toBe(2);
        const rows = await timelineOf(orderId, 'dispute_');
        expect(rows.map(({ type }) => type)).toEqual(['dispute_opened', 'dispute_closed']);
    });

    it('lets a closed dispute flip: a late win gives the room back, a reopened one clears closedAt', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });
        const lost = await staffView(orderId);
        expect(lost?.actions?.refund).toBe(false);

        await deliverReport(providerRef, {
            status: 'won',
            fundsWithdrawn: false,
            observedAt: at(120)
        });

        const won = await staffView(orderId);
        expect(won?.disputes?.[0]).toMatchObject({
            status: 'won',
            closedAt: when(120).toISOString()
        });
        expect(won?.actions?.refund).toBe(true);
        await deliverReport(providerRef, { status: 'needs_response', observedAt: at(180) });
        const reopened = await staffView(orderId);
        expect(reopened?.disputes?.[0].closedAt).toBeUndefined();
        expect(reopened?.actions?.refund).toBe(false);
    });

    it('drops a report for an intent it does not know, or another provider', async () => {
        const { orderId, providerRef } = await paidOrder();

        await deliverReport('fake_pi_unknown');
        // Authentic, but arriving at an endpoint the payment's provider does not own.
        registerPaymentProvider({ ...fakePaymentProvider, name: 'some-other-provider' });
        await deliver(setFakeDispute(providerRef, report()), 'some-other-provider');

        const view = await staffView(orderId);
        expect(view?.disputes).toBeUndefined();
        await settleOutboxNudges();
        expect(await events(PAYMENT_DISPUTE_OPENED)).toBe(0);
    });

    it('stores a report in another currency than the payment and announces it', async () => {
        const { orderId, providerRef } = await paidOrder();

        await deliverReport(providerRef, { currency: 'USD' });

        const view = await staffView(orderId);
        expect(view?.disputes).toEqual([expect.objectContaining({ currency: 'USD' })]);
        await settleOutboxNudges();
        expect(await events(PAYMENT_DISPUTE_OPENED)).toBe(1);
    });

    it('does not take a lost chargeback in another currency off what is left to refund', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef, {
            currency: 'USD',
            status: 'lost',
            amount: '70.00',
            observedAt: at(5)
        });

        const all = await refund(orderId, '100.00');

        expect(all.success).toBe(true);
    });
});

describe('the refund door while a dispute stands', () => {
    it('answers 409 PAYMENT_DISPUTED for an open chargeback and greys the action out', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);

        const asked = await refund(orderId, '10.00');

        expect(asReject(asked).status).toBe(409);
        expect(asReject(asked).errors[0].code).toBe('PAYMENT_DISPUTED');
        const view = await staffView(orderId);
        const payment = await paymentRepository.findByOrderId(orderId);
        expect(view?.actions?.refund).toBe(false);
        expect(payment?.refunds).toHaveLength(0);
    });

    it('keeps refunds allowed during an inquiry', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef, { kind: 'inquiry', fundsWithdrawn: false });

        const asked = await refund(orderId, '10.00');

        const view = await staffView(orderId);
        expect(asked.success).toBe(true);
        expect(view?.actions?.refund).toBe(true);
    });

    it('takes a lost chargeback off what is left: more than the rest is a 422', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef, { status: 'lost', amount: '70.00', observedAt: at(5) });

        const tooMuch = await refund(orderId, '40.00');
        const fits = await refund(orderId, '30.00');

        expect(asReject(tooMuch).status).toBe(422);
        expect(asReject(tooMuch).errors[0].code).toBe('PAYMENT_REFUND_EXCEEDS_REMAINING');
        expect(fits.success).toBe(true);
    });
});

describe('a refund the chargeback blocks', () => {
    it('fails final as disputed without asking the provider, and is not settleable meanwhile', async () => {
        await withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, providerRef } = await paidOrder();
            await deliverReport(providerRef);
            const send = jest.spyOn(fakePaymentProvider, 'refund').mockClear();

            // The order is canceled: the listener tries to give the money back.
            await refundForOrder(orderId).catch(() => undefined);
            await paymentService.retryOpenRefunds();

            expect(send).not.toHaveBeenCalled();
            const payment = await paymentRepository.findByOrderId(orderId);
            expect(payment?.refunds[0]).toMatchObject({
                status: 'failed',
                failureReason: 'disputed'
            });
            expect(payment?.refunds[0].nextAttemptAt).toBeUndefined();
            const view = await staffView(orderId);
            expect(view?.actions?.settleRefundByHand).toEqual([]);
            expect(view?.actions?.cancelRefund).toEqual([]);
            const attention = await paymentService.listAttention();
            expect(attention.items.map(({ kind }) => kind).toSorted()).toEqual([
                'dispute_needs_response',
                'refused_refund'
            ]);
        });
    });

    it('is reported returned once the chargeback is lost, with the normal refund event', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await refundForOrder(orderId).catch(() => undefined);
        const payment = await paymentRepository.findByOrderId(orderId);
        const refundId = String(payment?.refunds[0]._id);

        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });
        const offered = await staffView(orderId);
        expect(offered?.actions?.settleRefundByHand).toEqual([refundId]);
        expect(offered?.actions?.cancelRefund).toEqual([refundId]);
        const settled = await paymentService.settleRefundByHand(
            String(payment?._id),
            refundId,
            asAdmin(),
            callerContextAs('admin')
        );

        expect(settled.success).toBe(true);
        await settleOutboxNudges();
        expect(await events(PAYMENT_REFUNDED)).toBe(1);
    });
});

describe('the dispute on the staff reads', () => {
    it('shows a dispute waiting on the shop with its deadline and what was already refunded', async () => {
        const { orderId, providerRef } = await paidOrder();
        await refund(orderId, '30.00');

        await deliverReport(providerRef, { amount: '70.00' });

        const attention = await paymentService.listAttention();
        expect(attention.items).toEqual([
            expect.objectContaining({
                kind: 'dispute_needs_response',
                disputeId: 'dp_1',
                orderId,
                amount: '70.00',
                since: at(0),
                dueBy: at(7 * 24 * 60),
                alreadyRefunded: '30.00'
            })
        ]);
        expect(attention.items[0].refundId).toBeUndefined();
    });

    it('leaves a dispute under review off the list, and omits alreadyRefunded when nothing went back', async () => {
        const { providerRef } = await paidOrder();
        await deliverReport(providerRef);
        const shown = await paymentService.listAttention();
        expect(shown.items[0].alreadyRefunded).toBeUndefined();

        await deliverReport(providerRef, { status: 'under_review', observedAt: at(10) });

        const after = await paymentService.listAttention();
        expect(after.items).toEqual([]);
    });

    it('filters the payments list to those with a dispute still open', async () => {
        const { providerRef } = await paidOrder();
        await paidOrder();
        await deliverReport(providerRef);

        const open = await paymentService.listPayments({ disputed: true }, asAdmin());
        const all = await paymentService.listPayments({ disputed: false }, asAdmin());
        await deliverReport(providerRef, {
            status: 'won',
            fundsWithdrawn: false,
            observedAt: at(10)
        });
        const closed = await paymentService.listPayments({ disputed: true }, asAdmin());

        expect(open.items).toHaveLength(1);
        expect(all.items).toHaveLength(2);
        expect(closed.items).toHaveLength(0);
    });
});

/** The payment's id, which the standing is asked by. */
const paymentIdOf = (orderId: string) =>
    paymentRepository.findByOrderId(orderId).then((payment) => String(payment?._id));

describe('disputeStanding', () => {
    it('says a dispute is open, and the payment currency, while one waits on someone', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);

        const standing = await paymentService.disputeStanding(await paymentIdOf(orderId));

        expect(standing).toEqual({ open: true, currency: 'EUR' });
    });

    it('says none is open once every dispute is decided, and when none was ever reported', async () => {
        const decided = await paidOrder();
        await deliverReport(decided.providerRef, {
            status: 'won',
            fundsWithdrawn: false,
            observedAt: at(10)
        });
        const never = await paidOrder();

        expect(await paymentService.disputeStanding(await paymentIdOf(decided.orderId))).toEqual({
            open: false,
            currency: 'EUR'
        });
        expect(await paymentService.disputeStanding(await paymentIdOf(never.orderId))).toEqual({
            open: false,
            currency: 'EUR'
        });
    });

    it('answers undefined for a payment that does not exist', async () => {
        expect(await paymentService.disputeStanding('65dc8a99604c307b702b5ccc')).toBeUndefined();
    });
});

/**
 * Put a refund the dispute refused on the payment's record, the state a refund opened while a
 * chargeback stood is left in. Written straight to storage: two such records on one payment cannot
 * be made through the door, which keeps a single open refund per cancel.
 *
 * @param orderId - the order whose payment gets the record
 * @param amount - the refund's amount, a decimal in EUR
 * @param over - fields that make it another kind of record (settled, reversed, other reason)
 */
const seedRefund = async (
    orderId: string,
    amount: string,
    over: Record<string, unknown> = {}
): Promise<string> => {
    const payment = await paymentRepository.findByOrderId(orderId);
    const refundId = new Types.ObjectId();
    await paymentModel
        .updateOne(
            { _id: payment?._id },
            {
                $push: {
                    refunds: {
                        _id: refundId,
                        amount,
                        currency: 'EUR',
                        status: 'failed',
                        reason: 'cancellation',
                        idempotencyKey: `key-${String(refundId)}`,
                        failureReason: 'disputed',
                        attempts: 1,
                        ...over
                    }
                }
            }
        )
        .exec();
    return String(refundId);
};

/** The `payment.refund_owed_after_dispute` payloads written so far. */
const owedEvents = () =>
    outboxEventModel
        .find({ name: PAYMENT_REFUND_OWED_AFTER_DISPUTE })
        .sort({ createdAt: 1 })
        .lean()
        .exec()
        .then((rows) => rows.map(({ payload }) => payload as Record<string, unknown>));

describe('a dispute ends while refunds wait on it', () => {
    it('raises one event per refund still owed, saying the bank kept the money after a loss', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        const first = await seedRefund(orderId, '30.00');
        const second = await seedRefund(orderId, '20.00', { reversedAt: new Date() });

        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });

        await settleOutboxNudges();
        const owed = await owedEvents();
        expect(owed).toEqual([
            expect.objectContaining({
                orderId,
                disputeId: 'dp_1',
                refundId: first,
                amount: '30.00',
                currency: 'EUR',
                reversed: false,
                bankKept: true
            }),
            expect.objectContaining({ refundId: second, reversed: true, bankKept: true })
        ]);
        expect(owed[0]).not.toHaveProperty('otherCurrency');
    });

    it('says the shop kept the money after a win', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await seedRefund(orderId, '30.00');

        await deliverReport(providerRef, {
            status: 'won',
            fundsWithdrawn: false,
            observedAt: at(60)
        });

        expect(await owedEvents()).toEqual([expect.objectContaining({ bankKept: false })]);
    });

    it('names the dispute’s currency when the bank kept money in another one', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await seedRefund(orderId, '30.00');

        await deliverReport(providerRef, {
            status: 'accepted',
            currency: 'USD',
            observedAt: at(60)
        });

        expect(await owedEvents()).toEqual([
            expect.objectContaining({ bankKept: true, otherCurrency: 'USD' })
        ]);
    });

    it.each([
        ['no refund was refused as disputed', undefined],
        ['the refund settled elsewhere', { status: 'succeeded' }],
        ['the refund was voided', { failureReason: 'canceled' }],
        ['the refund was refused for another reason', { failureReason: 'declined' }]
    ] as const)('raises nothing when %s', async (_name, over) => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        if (over) await seedRefund(orderId, '30.00', over);

        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });

        await settleOutboxNudges();
        expect(await events(PAYMENT_REFUND_OWED_AFTER_DISPUTE)).toBe(0);
    });

    it('waits for the second dispute: nothing is owed while another one is open', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await deliverReport(providerRef, { disputeRef: 'dp_2', observedAt: at(1) });
        await seedRefund(orderId, '30.00');

        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });
        expect(await events(PAYMENT_REFUND_OWED_AFTER_DISPUTE)).toBe(0);

        await deliverReport(providerRef, {
            disputeRef: 'dp_2',
            status: 'won',
            fundsWithdrawn: false,
            observedAt: at(90)
        });
        // dp_1 lost: the bank kept money on this payment, whichever dispute ended last.
        expect(await owedEvents()).toEqual([
            expect.objectContaining({ disputeId: 'dp_2', bankKept: true })
        ]);
    });

    it('says the shop kept the money only when no dispute on the payment kept any', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await deliverReport(providerRef, { disputeRef: 'dp_2', observedAt: at(1) });
        await seedRefund(orderId, '30.00');
        await deliverReport(providerRef, {
            status: 'won',
            fundsWithdrawn: false,
            observedAt: at(60)
        });

        await deliverReport(providerRef, {
            disputeRef: 'dp_2',
            status: 'won',
            fundsWithdrawn: false,
            observedAt: at(90)
        });

        expect(await owedEvents()).toEqual([
            expect.objectContaining({ disputeId: 'dp_2', bankKept: false })
        ]);
    });

    it('counts a loss in another currency on an earlier dispute, and names that currency', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await deliverReport(providerRef, { disputeRef: 'dp_2', observedAt: at(1) });
        await seedRefund(orderId, '30.00');
        await deliverReport(providerRef, { status: 'lost', currency: 'USD', observedAt: at(60) });

        await deliverReport(providerRef, {
            disputeRef: 'dp_2',
            status: 'won',
            fundsWithdrawn: false,
            observedAt: at(90)
        });

        expect(await owedEvents()).toEqual([
            expect.objectContaining({ bankKept: true, otherCurrency: 'USD' })
        ]);
    });

    it('says it once: a repeated report of the same ending raises nothing more', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await seedRefund(orderId, '30.00');
        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });

        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });

        expect(await events(PAYMENT_REFUND_OWED_AFTER_DISPUTE)).toBe(1);
    });

    it('tells staff again when the lost dispute is then won and the refund is still refused', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        const refundId = await seedRefund(orderId, '30.00');
        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });

        await deliverReport(providerRef, win('dp_1', 120));

        const owed = await owedEvents();
        expect(owed).toHaveLength(2);
        expect(owed[0]).toMatchObject({ refundId, bankKept: true });
        expect(owed[0]).not.toHaveProperty('followsFlip');
        expect(owed[1]).toMatchObject({ refundId, bankKept: false, followsFlip: true });
    });

    it('keeps saying the bank kept money when a flip leaves another dispute still holding it', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await deliverReport(providerRef, { disputeRef: 'dp_2', observedAt: at(1) });
        await seedRefund(orderId, '30.00');
        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });
        await deliverReport(providerRef, {
            disputeRef: 'dp_2',
            status: 'lost',
            observedAt: at(90)
        });

        await deliverReport(providerRef, win('dp_1', 120));

        // dp_2's loss, then dp_1's flip: both tell staff the bank kept money.
        const owed = await owedEvents();
        expect(owed.map(({ bankKept }) => bankKept)).toEqual([true, true]);
    });

    it('says the shop kept the money when the first dispute flips while another is open and that one is then won', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await seedRefund(orderId, '30.00');
        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });
        await deliverReport(providerRef, { disputeRef: 'dp_2', observedAt: at(70) });
        await deliverReport(providerRef, win('dp_1', 80));
        // The flip happened while dp_2 was open: nothing was raised for it.
        expect(await events(PAYMENT_REFUND_OWED_AFTER_DISPUTE)).toBe(1);

        await deliverReport(providerRef, win('dp_2', 90));

        const owed = await owedEvents();
        expect(owed.map(({ bankKept }) => bankKept)).toEqual([true, false]);
    });

    it('says the shop kept the money when a lost dispute is reopened and then won', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await seedRefund(orderId, '30.00');
        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });
        await deliverReport(providerRef, { status: 'under_review', observedAt: at(70) });

        await deliverReport(providerRef, win('dp_1', 80));

        const owed = await owedEvents();
        expect(owed.map(({ bankKept }) => bankKept)).toEqual([true, false]);
        expect(owed[1]).not.toHaveProperty('followsFlip');
    });

    it('announces a dispute that is first reported already decided, with its owed refund', async () => {
        const { orderId, providerRef } = await paidOrder();
        await seedRefund(orderId, '30.00');

        await deliverReport(providerRef, { status: 'lost' });

        expect(await owedEvents()).toEqual([expect.objectContaining({ bankKept: true })]);
    });

    it('leaves the dispute unrecorded when the write step throws, and records it on redelivery', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        await seedRefund(orderId, '30.00');
        const real = paymentRepository.findByOrderId.bind(paymentRepository);
        // The re-read inside the writing transaction is the only call that carries a session.
        const failing = jest
            .spyOn(paymentRepository, 'findByOrderId')
            .mockImplementation((id, scope, session) =>
                session ? Promise.reject(new Error('read failed')) : real(id, scope, session)
            );

        await expect(
            deliverReport(providerRef, { status: 'lost', observedAt: at(60) })
        ).rejects.toThrow('read failed');

        const stored = await paymentRepository.findByOrderId(orderId);
        expect(stored?.disputes[0].status).toBe('needs_response');
        expect(await events(PAYMENT_DISPUTE_UPDATED)).toBe(0);
        expect(await events(PAYMENT_REFUND_OWED_AFTER_DISPUTE)).toBe(0);

        failing.mockRestore();
        await deliverReport(providerRef, { status: 'lost', observedAt: at(60) });

        expect(await events(PAYMENT_DISPUTE_UPDATED)).toBe(1);
        expect(await events(PAYMENT_REFUND_OWED_AFTER_DISPUTE)).toBe(1);
    });
});

/**
 * Lose the dispute, then mark the refund it refused returned: the buyer already has the money
 * from the bank. Returns the refund's id and the payment's.
 *
 * @param orderId - the paid order
 * @param providerRef - its payment's provider reference
 * @param disputeRef - the dispute the bank kept the money in
 */
const loseThenMarkReturned = async (orderId: string, providerRef: string, disputeRef = 'dp_1') => {
    await deliverReport(providerRef, { disputeRef });
    const refundId = await seedRefund(orderId, '30.00');
    await deliverReport(providerRef, { disputeRef, status: 'lost', observedAt: at(60) });
    const payment = await paymentRepository.findByOrderId(orderId);
    const settled = await paymentService.settleRefundByHand(
        String(payment?._id),
        refundId,
        asAdmin(),
        callerContextAs('admin')
    );
    expect(settled.success).toBe(true);
    return refundId;
};

/** A report of a won dispute, the bank returning the funds to the shop. */
const win = (disputeRef: string, minutes: number): Partial<ProviderDisputeState> => ({
    disputeRef,
    status: 'won',
    fundsWithdrawn: false,
    observedAt: at(minutes)
});

describe('a lost dispute flips to won after the refund was marked returned', () => {
    it('remembers the dispute on the refund, and never shows it to a client', async () => {
        const { orderId, providerRef } = await paidOrder();

        const refundId = await loseThenMarkReturned(orderId, providerRef);

        const stored = await paymentRepository.findByOrderId(orderId);
        expect(stored?.refunds.find(({ _id }) => String(_id) === refundId)).toMatchObject({
            status: 'succeeded',
            settledAgainstDispute: 'dp_1'
        });
        const view = await staffView(orderId);
        expect(JSON.stringify(view)).not.toContain('settledAgainstDispute');
    });

    it('raises one more event for that refund: owed again, not voidable, the shop kept the money', async () => {
        const { orderId, providerRef } = await paidOrder();
        const refundId = await loseThenMarkReturned(orderId, providerRef);
        await settleOutboxNudges();
        // The loss itself told staff the refund was owed; that is the one already there.
        expect(await events(PAYMENT_REFUND_OWED_AFTER_DISPUTE)).toBe(1);

        await deliverReport(providerRef, win('dp_1', 120));

        await settleOutboxNudges();
        const owed = await owedEvents();
        expect(owed).toHaveLength(2);
        expect(owed[1]).toEqual(
            expect.objectContaining({
                refundId,
                disputeId: 'dp_1',
                reversed: true,
                bankKept: false,
                markedReturned: true
            })
        );
    });

    it('leaves a refund staff marked returned for another dispute alone', async () => {
        const { orderId, providerRef } = await paidOrder();
        await loseThenMarkReturned(orderId, providerRef, 'dp_1');
        await deliverReport(providerRef, { disputeRef: 'dp_2', observedAt: at(61) });

        await deliverReport(providerRef, win('dp_2', 120));

        await settleOutboxNudges();
        // Only the one the first dispute's loss raised.
        expect(await events(PAYMENT_REFUND_OWED_AFTER_DISPUTE)).toBe(1);
    });

    it('raises nothing when no refund is owed, or the dispute was never lost', async () => {
        const lost = await paidOrder();
        await deliverReport(lost.providerRef);
        await deliverReport(lost.providerRef, { status: 'lost', observedAt: at(60) });
        const won = await paidOrder();
        await deliverReport(won.providerRef);
        await seedRefund(won.orderId, '30.00');
        await deliverReport(won.providerRef, win('dp_1', 60));
        await settleOutboxNudges();
        const sofar = await events(PAYMENT_REFUND_OWED_AFTER_DISPUTE);

        await deliverReport(lost.providerRef, win('dp_1', 120));

        await settleOutboxNudges();
        expect(await events(PAYMENT_REFUND_OWED_AFTER_DISPUTE)).toBe(sofar);
    });

    it('marks nothing when the refund is marked returned after the shop won', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef);
        const refundId = await seedRefund(orderId, '30.00');
        await deliverReport(providerRef, win('dp_1', 60));
        const payment = await paymentRepository.findByOrderId(orderId);

        await paymentService.settleRefundByHand(
            String(payment?._id),
            refundId,
            asAdmin(),
            callerContextAs('admin')
        );

        const stored = await paymentRepository.findByOrderId(orderId);
        expect(stored?.refunds[0].settledAgainstDispute).toBeUndefined();
    });
});

describe('keptInOtherCurrencyOn', () => {
    it('answers the dispute’s currency and the payment’s for a lost chargeback in another currency', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef, { status: 'lost', currency: 'USD' });

        const answer = await paymentService.keptInOtherCurrencyOn(await paymentIdOf(orderId));

        expect(answer).toEqual({ disputeCurrency: 'USD', paymentCurrency: 'EUR' });
    });

    it('answers it for a lost chargeback on ANOTHER dispute of the payment', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef, { status: 'lost', currency: 'USD' });
        await deliverReport(providerRef, win('dp_2', 120));

        const answer = await paymentService.keptInOtherCurrencyOn(await paymentIdOf(orderId));

        expect(answer).toEqual({ disputeCurrency: 'USD', paymentCurrency: 'EUR' });
    });

    it.each([
        ['a lost one in the payment’s currency', { status: 'lost', currency: 'EUR' }],
        ['a won one in another currency', { status: 'won', currency: 'USD' }]
    ] as const)('answers nothing for %s', async (_name, over) => {
        const { orderId, providerRef } = await paidOrder();
        await deliverReport(providerRef, over);

        const answer = await paymentService.keptInOtherCurrencyOn(await paymentIdOf(orderId));

        expect(answer).toBeUndefined();
    });

    it('answers nothing for a payment that does not exist', async () => {
        expect(
            await paymentService.keptInOtherCurrencyOn('65dc8a99604c307b702b5ccc')
        ).toBeUndefined();
    });
});
