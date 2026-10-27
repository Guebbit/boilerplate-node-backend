/**
 * @module
 * The buyer's bank disputes a card payment. The provider's delivery is stored on the payment, ordered
 * by its own `observedAt`, announced, put on the order's staff timeline and shown on the attention
 * list; an open chargeback closes the refund door, a lost one takes its amount off what can be
 * refunded, and none of it is a refund (no `payment.refunded`, no credit note, no order change).
 * Real Mongo, the fake provider's dispute lever, through the services' public door.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem, timelineOf } from '@modules/orders/tests/factories';
import { orderService } from '@modules/orders';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import {
    PAYMENT_DISPUTE_OPENED,
    PAYMENT_DISPUTE_UPDATED,
    PAYMENT_REFUNDED
} from '@modules/payments/events';
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
    const product = await createProduct({ price: 50 });
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
    amount: 100,
    currency: 'EUR',
    fundsWithdrawn: true,
    evidenceDueBy: at(7 * 24 * 60),
    observedAt: at(0),
    ...over
});

/** Deliver one dispute report the way the webhook route hands it to the service. */
const deliver = (providerRef: string, over: Partial<ProviderDisputeState> = {}) =>
    paymentService.applyWebhookDelivery(setFakeDispute(providerRef, report(over)), 'fake');

/** The payment as the shop's staff read it. */
const staffView = (orderId: string) =>
    paymentService.getForOrder(orderId, asAdmin()).then((answer) => answer.data);

/** How many outbox rows of one event exist. */
const events = (name: string) => outboxEventModel.countDocuments({ name });

/** The operator asking to refund `amount` of the order's payment. */
const refund = (orderId: string, amount?: number) =>
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

        await deliver(providerRef);

        const view = await staffView(orderId);
        expect(view?.disputes).toEqual([
            expect.objectContaining({
                disputeRef: 'dp_1',
                kind: 'chargeback',
                status: 'needs_response',
                amount: 100,
                fundsWithdrawn: true,
                openedAt: when(0),
                evidenceDueBy: when(7 * 24 * 60)
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
        await deliver(providerRef);
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
        await deliver(providerRef, { status: 'under_review', observedAt: at(30) });

        await deliver(providerRef, { status: 'needs_response', observedAt: at(10) });
        await deliver(providerRef, { status: 'under_review', observedAt: at(30) });

        const view = await staffView(orderId);
        expect(view?.disputes?.[0]).toMatchObject({ status: 'under_review', observedAt: when(30) });
        await settleOutboxNudges();
        expect(await events(PAYMENT_DISPUTE_OPENED)).toBe(1);
        expect(await events(PAYMENT_DISPUTE_UPDATED)).toBe(0);
    });

    it('applies a newer report as an update, and closes the timeline once', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliver(providerRef);

        await deliver(providerRef, { status: 'lost', observedAt: at(60) });
        await deliver(providerRef, { status: 'lost', observedAt: at(61) });

        const view = await staffView(orderId);
        expect(view?.disputes?.[0]).toMatchObject({ status: 'lost', closedAt: when(61) });
        await settleOutboxNudges();
        expect(await events(PAYMENT_DISPUTE_UPDATED)).toBe(2);
        const rows = await timelineOf(orderId, 'dispute_');
        expect(rows.map(({ type }) => type)).toEqual(['dispute_opened', 'dispute_closed']);
    });

    it('lets a closed dispute flip: a late win gives the room back, a reopened one clears closedAt', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliver(providerRef);
        await deliver(providerRef, { status: 'lost', observedAt: at(60) });
        const lost = await staffView(orderId);
        expect(lost?.actions?.refund).toBe(false);

        await deliver(providerRef, { status: 'won', fundsWithdrawn: false, observedAt: at(120) });

        const won = await staffView(orderId);
        expect(won?.disputes?.[0]).toMatchObject({ status: 'won', closedAt: when(120) });
        expect(won?.actions?.refund).toBe(true);
        await deliver(providerRef, { status: 'needs_response', observedAt: at(180) });
        const reopened = await staffView(orderId);
        expect(reopened?.disputes?.[0].closedAt).toBeUndefined();
        expect(reopened?.actions?.refund).toBe(false);
    });

    it('drops a report for an intent it does not know, another provider, or another currency', async () => {
        const { orderId, providerRef } = await paidOrder();

        await deliver('fake_pi_unknown');
        await paymentService.applyWebhookDelivery(
            setFakeDispute(providerRef, report()),
            'some-other-provider'
        );
        await deliver(providerRef, { currency: 'USD' });

        const view = await staffView(orderId);
        expect(view?.disputes).toBeUndefined();
        await settleOutboxNudges();
        expect(await events(PAYMENT_DISPUTE_OPENED)).toBe(0);
    });
});

describe('the refund door while a dispute stands', () => {
    it('answers 409 PAYMENT_DISPUTED for an open chargeback and greys the action out', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliver(providerRef);

        const asked = await refund(orderId, 10);

        expect(asReject(asked).status).toBe(409);
        expect(asReject(asked).errors[0].code).toBe('PAYMENT_DISPUTED');
        const view = await staffView(orderId);
        const payment = await paymentRepository.findByOrderId(orderId);
        expect(view?.actions?.refund).toBe(false);
        expect(payment?.refunds).toHaveLength(0);
    });

    it('keeps refunds allowed during an inquiry', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliver(providerRef, { kind: 'inquiry', fundsWithdrawn: false });

        const asked = await refund(orderId, 10);

        const view = await staffView(orderId);
        expect(asked.success).toBe(true);
        expect(view?.actions?.refund).toBe(true);
    });

    it('takes a lost chargeback off what is left: more than the rest is a 422', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliver(providerRef, { status: 'lost', amount: 70, observedAt: at(5) });

        const tooMuch = await refund(orderId, 40);
        const fits = await refund(orderId, 30);

        expect(asReject(tooMuch).status).toBe(422);
        expect(asReject(tooMuch).errors[0].code).toBe('PAYMENT_REFUND_EXCEEDS_REMAINING');
        expect(fits.success).toBe(true);
    });
});

describe('a refund the chargeback blocks', () => {
    it('fails final as disputed without asking the provider, and is not settleable meanwhile', async () => {
        await withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, providerRef } = await paidOrder();
            await deliver(providerRef);
            const send = jest.spyOn(fakePaymentProvider, 'refund').mockClear();

            // The order is cancelled: the listener tries to give the money back.
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
            expect(view?.actions?.settleByHand).toEqual([]);
            expect(view?.actions?.cancelRefund).toEqual([]);
            const attention = await paymentService.listAttention();
            expect(attention.items.map(({ kind }) => kind).toSorted()).toEqual([
                'dispute_needs_response',
                'refused_refund'
            ]);
        });
    });

    it('is reported returned once the chargeback is lost (N10-a), with the normal refund event', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliver(providerRef);
        await refundForOrder(orderId).catch(() => undefined);
        const payment = await paymentRepository.findByOrderId(orderId);
        const refundId = String(payment?.refunds[0]._id);

        await deliver(providerRef, { status: 'lost', observedAt: at(60) });
        const offered = await staffView(orderId);
        expect(offered?.actions?.settleByHand).toEqual([refundId]);
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

    it('may only be voided once the shop won', async () => {
        const { orderId, providerRef } = await paidOrder();
        await deliver(providerRef);
        await refundForOrder(orderId).catch(() => undefined);
        const payment = await paymentRepository.findByOrderId(orderId);
        const refundId = String(payment?.refunds[0]._id);

        await deliver(providerRef, { status: 'won', fundsWithdrawn: false, observedAt: at(60) });

        const view = await staffView(orderId);
        expect(view?.actions?.settleByHand).toEqual([]);
        expect(view?.actions?.cancelRefund).toEqual([refundId]);
    });
});

describe('the dispute on the staff reads', () => {
    it('shows a dispute waiting on the shop with its deadline and what was already refunded', async () => {
        const { orderId, providerRef } = await paidOrder();
        await refund(orderId, 30);

        await deliver(providerRef, { amount: 70 });

        const attention = await paymentService.listAttention();
        expect(attention.items).toEqual([
            expect.objectContaining({
                kind: 'dispute_needs_response',
                disputeId: 'dp_1',
                orderId,
                amount: 70,
                since: at(0),
                dueBy: at(7 * 24 * 60),
                alreadyRefunded: 30
            })
        ]);
        expect(attention.items[0].refundId).toBeUndefined();
    });

    it('leaves a dispute under review off the list, and omits alreadyRefunded when nothing went back', async () => {
        const { providerRef } = await paidOrder();
        await deliver(providerRef);
        const shown = await paymentService.listAttention();
        expect(shown.items[0].alreadyRefunded).toBeUndefined();

        await deliver(providerRef, { status: 'under_review', observedAt: at(10) });

        const after = await paymentService.listAttention();
        expect(after.items).toEqual([]);
    });

    it('filters the payments list to those with a dispute still open', async () => {
        const { providerRef } = await paidOrder();
        await paidOrder();
        await deliver(providerRef);

        const open = await paymentService.listPayments({ disputed: true }, asAdmin());
        const all = await paymentService.listPayments({ disputed: false }, asAdmin());
        await deliver(providerRef, { status: 'won', fundsWithdrawn: false, observedAt: at(10) });
        const closed = await paymentService.listPayments({ disputed: true }, asAdmin());

        expect(open.items).toHaveLength(1);
        expect(all.items).toHaveLength(2);
        expect(closed.items).toHaveLength(0);
    });
});
