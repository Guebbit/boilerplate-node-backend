/**
 * @module
 * A refund staff already paid outside the application (`paidOutside`): the record is born
 * settled by hand, on a card payment or a hand-paid one, so the provider is never asked, the sweep
 * has nothing to send, and nothing waits for an operator. Real Mongo, through the services' public
 * door; the credit note itself is `invoicing`'s, here only its trigger (`payment.refunded`) is.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, timelineOf, toOrderItem } from '@modules/orders/tests/factories';
import { orderService } from '@modules/orders';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { deliver } from '@modules/payments/tests/deliver';
import { PAYMENT_REFUNDED, PAYMENT_REFUND_OWED_BY_HAND } from '@modules/payments/events';
import paymentsModule from '@modules/payments/module';
import { fakePaymentProvider, setFakeDispute } from '@scenarios/support/doubles/payments/fake';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import { asReject, asSuccess } from '@tests/response';
import { eventually } from '@tests/eventually';
import { payByCard, refundOrderPayment } from '@modules/payments/tests/factories';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));

/** Stands in for the mail queue; the cases assert which mail was enqueued. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

/** The audit rows written since the test began. */
let audited: AuditEntry[] = [];

beforeEach(() => {
    mockEnqueueEmail.mockClear();
    registerCheckoutModules([paymentsModule]);
    audited = [];
    registerAuditSink((entry) => audited.push(entry));
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** Makes each buyer's address unique within a test. */
let buyers = 0;

/** A new order of 100.00 (two units at 50.00) and its buyer. */
const newOrder = async () => {
    const user = await createUser({ email: `outside-${String(buyers++)}@example.com` });
    const product = await createProduct({ price: '50.00', onHand: 10 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    return { user, order, orderId: String(order._id) };
};

/** 100.00 paid by card. */
const cardOrder = async () => {
    const fixture = await newOrder();
    await payByCard(fixture.order, fixture.user);
    await settleOutboxNudges();
    return fixture;
};

/** 100.00 paid in cash, recorded by hand. */
const cashOrder = async () => {
    const fixture = await newOrder();
    const recorded = await paymentService.recordOfflinePayment(
        fixture.orderId,
        { method: 'cash' },
        callerContextAs('admin')
    );
    asSuccess(recorded);
    return fixture;
};

/** The stored payment behind an order. */
const paymentOf = (orderId: string) =>
    paymentRepository.findByOrderId(orderId).then((payment) => {
        if (!payment) throw new Error('no payment');
        return payment;
    });

/** An operator saying `amount` already went back as cash. */
const refundOutside = (orderId: string, amount?: string, reference?: string) =>
    refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), {
        ...(amount === undefined ? {} : { amount }),
        paidOutside: { method: 'cash', ...(reference === undefined ? {} : { reference }) }
    });

/** The audit rows that say a refund's money was returned outside the application. */
const settledByHandRows = () =>
    audited.filter(({ action }) => action === 'admin.payment.refund_settled_by_hand');

describe('a refund recorded as paid outside, on a card payment', () => {
    it('is born settled: the provider is never asked, the sweep finds nothing, the follow-ups run', async () => {
        const { orderId } = await cardOrder();
        const send = jest.spyOn(fakePaymentProvider, 'refund').mockClear();

        const answer = asSuccess(await refundOutside(orderId, '30.00', 'receipt 17'));

        expect(answer.status).toBe(201);
        const payment = await paymentOf(orderId);
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({
            amount: '30.00',
            status: 'succeeded',
            settledByHand: true,
            reason: 'goodwill',
            paidOutside: { method: 'cash', reference: 'receipt 17' }
        });
        expect(payment.refunds[0].settledAt).toBeInstanceOf(Date);
        expect(payment.refunds[0].providerRefundRef).toBeUndefined();
        expect(payment.amountRefunded).toBe('30.00');
        expect(answer.data.refundId).toBe(String(payment.refunds[0]._id));

        // The sweep sees nothing open, and the provider was never asked, at any point.
        await paymentService.retryOpenRefunds();
        expect(send).not.toHaveBeenCalled();

        // The order follows: the stamp, and both timeline rows of a refund that opened and settled.
        const order = await orderService.getById(orderId);
        expect(order?.paymentStatus).toBe('partially_refunded');
        const rows = await timelineOf(orderId, 'refund_');
        expect(rows.map(({ type }) => type)).toEqual(['refund_issued', 'refund_settled']);

        // `payment.refunded` is what `invoicing` issues the credit note from; the buyer is mailed.
        await settleOutboxNudges();
        const events = await outboxEventModel.find({ name: PAYMENT_REFUNDED }).lean();
        expect(events).toHaveLength(1);
        expect(events[0].payload).toMatchObject({
            orderId,
            refundId: String(payment.refunds[0]._id),
            amount: '30.00',
            full: false
        });
        await eventually(() =>
            settleOutboxNudges().then(
                () =>
                    mockEnqueueEmail.mock.calls.filter(
                        ([, name]) => name === 'payments.refund-issued'
                    ).length === 1
            )
        );

        // Audited as the settlement by hand it is, under the operator who said so.
        expect(settledByHandRows()).toHaveLength(1);
        expect(settledByHandRows()[0].metadata).toMatchObject({
            refundId: String(payment.refunds[0]._id),
            amount: '30.00'
        });
    });

    it('refunds everything left when no amount is given, and the order reads refunded', async () => {
        const { orderId } = await cardOrder();

        await refundOutside(orderId);

        const payment = await paymentOf(orderId);
        expect(payment.amountRefunded).toBe('100.00');
        expect(payment.refunds[0]).toMatchObject({ amount: '100.00', status: 'succeeded' });
        const order = await orderService.getById(orderId);
        expect(order?.paymentStatus).toBe('refunded');
        await settleOutboxNudges();
        const [event] = await outboxEventModel.find({ name: PAYMENT_REFUNDED }).lean();
        expect(event.payload).toMatchObject({ full: true });
    });

    it('refuses more than is left with the same 422, and writes nothing', async () => {
        const { orderId } = await cardOrder();
        await refundOutside(orderId, '70.00');

        const asked = asReject(await refundOutside(orderId, '40.00'));

        expect(asked.status).toBe(422);
        expect(asked.errors[0].code).toBe('PAYMENT_REFUND_EXCEEDS_REMAINING');
        const payment = await paymentOf(orderId);
        expect(payment.refunds).toHaveLength(1);
        expect(payment.amountRefunded).toBe('70.00');
        expect(settledByHandRows()).toHaveLength(1);
    });

    it('re-reads and retries when a racing write moved the total: still settled, still no provider', async () => {
        const { orderId } = await cardOrder();
        const send = jest.spyOn(fakePaymentProvider, 'refund').mockClear();
        jest.spyOn(paymentRepository, 'addRefund').mockResolvedValueOnce(null);

        asSuccess(await refundOutside(orderId, '30.00'));

        const payment = await paymentOf(orderId);
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({ status: 'succeeded', settledByHand: true });
        expect(payment.amountRefunded).toBe('30.00');
        expect(send).not.toHaveBeenCalled();
        expect(settledByHandRows()).toHaveLength(1);
    });

    it('gives up when every attempt misses: no record, no event, the not-refundable answer', async () => {
        const { orderId } = await cardOrder();
        const send = jest.spyOn(fakePaymentProvider, 'refund').mockClear();
        const missed = jest.spyOn(paymentRepository, 'addRefund').mockResolvedValue(null);

        const asked = asReject(await refundOutside(orderId, '30.00'));

        // The first attempt and two re-reads.
        expect(missed).toHaveBeenCalledTimes(3);
        expect(asked.status).toBe(409);
        expect(asked.errors[0].code).toBe('PAYMENT_NOT_REFUNDABLE');
        const payment = await paymentOf(orderId);
        expect(payment.refunds).toEqual([]);
        expect(Number(payment.amountRefunded)).toBe(0);
        await settleOutboxNudges();
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_REFUNDED })).toBe(0);
        expect(send).not.toHaveBeenCalled();
        expect(settledByHandRows()).toEqual([]);
    });

    it('still answers 409 for an open chargeback: the bank took the money back already', async () => {
        const { orderId } = await cardOrder();
        const { providerRef } = await paymentOf(orderId);
        await deliver(
            setFakeDispute(String(providerRef), {
                disputeRef: 'dp_1',
                kind: 'chargeback',
                status: 'needs_response',
                reason: 'fraudulent',
                amount: '100.00',
                currency: 'EUR',
                fundsWithdrawn: true,
                observedAt: new Date().toISOString()
            })
        );

        const asked = asReject(await refundOutside(orderId, '10.00'));

        expect(asked.errors[0].code).toBe('PAYMENT_DISPUTED');
        const unchanged = await paymentOf(orderId);
        expect(unchanged.refunds).toEqual([]);
    });

    it('shows the method to the buyer and the reference to staff only', async () => {
        const { orderId, user } = await cardOrder();
        await refundOutside(orderId, '30.00', 'receipt 17');

        const staff = asSuccess(await paymentService.getForOrder(orderId, asAdmin()));
        const buyer = asSuccess(await paymentService.getForOrder(orderId, asCustomer(user.id)));

        expect(staff.data.refunds[0].paidOutside).toEqual({
            method: 'cash',
            reference: 'receipt 17'
        });
        expect(buyer.data.refunds[0].paidOutside).toEqual({ method: 'cash' });
    });
});

describe('a refund recorded as paid outside, on a hand-paid payment', () => {
    it('is settled at once: nothing left pending and no owed-by-hand to-do', async () => {
        const { orderId } = await cashOrder();

        asSuccess(await refundOutside(orderId, '30.00'));

        const payment = await paymentOf(orderId);
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({
            status: 'succeeded',
            settledByHand: true,
            paidOutside: { method: 'cash' }
        });
        await settleOutboxNudges();
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_REFUND_OWED_BY_HAND })).toBe(
            0
        );
        expect(audited.filter(({ action }) => action === 'payment.refund_owed_by_hand')).toEqual(
            []
        );
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_REFUNDED })).toBe(1);
        const view = asSuccess(await paymentService.getForOrder(orderId, asAdmin()));
        expect(view.data.actions?.settleRefundByHand).toEqual([]);
    });

    it('without paidOutside still opens a pending record: only the statement settles it', async () => {
        const { orderId } = await cashOrder();

        asSuccess(
            await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), {
                amount: '30.00'
            })
        );

        const payment = await paymentOf(orderId);
        expect(payment.refunds[0]).toMatchObject({ status: 'pending' });
        expect(payment.refunds[0].paidOutside).toBeUndefined();
    });
});
