/**
 * @module
 * Refunds on hand-paid money, from the operator's side: every way a record opens leaves it
 * `pending`, and `settleRefundByHand` is the one door that says the money went back. Real Mongo,
 * through the services' public door.
 */

import { refundOrderPayment } from '../factories';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { paymentAttentionMinutes, paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { PAYMENT_REFUND_OWED_BY_HAND, PAYMENT_REFUNDED } from '@modules/payments/events';
import paymentsModule from '@modules/payments/module';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { asAdmin, asModerator, callerContextAs } from '@tests/callers';
import { asReject } from '@tests/response';
import { payByCard, refundForOrder } from '@modules/payments/tests/factories';

setupTestDb();

/** The audit rows written since the test began. */
let audited: AuditEntry[] = [];

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
    audited = [];
    registerAuditSink((entry) => audited.push(entry));
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A cash payment of 100.00 on a fresh order (two units at 50.00). */
const cashOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    const orderId = String(order._id);
    await paymentService.recordOfflinePayment(
        orderId,
        { method: 'cash' },
        callerContextAs('admin')
    );
    return { user, order, orderId };
};

/** The stored payment behind an order. */
const paymentOf = async (orderId: string) => {
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw new Error('no payment');
    return payment;
};

/** The `payment.refund_owed_by_hand` rows so far. */
const owedRows = () => audited.filter(({ action }) => action === 'payment.refund_owed_by_hand');

/** Settle `refundId` of `paymentId` as an admin. */
const settle = (paymentId: string, refundId: string) =>
    paymentService.settleRefundByHand(paymentId, refundId, asAdmin(), callerContextAs('admin'));

describe('the operator refunding a cash payment', () => {
    it('opens a pending record and settles nothing, however privileged the caller', async () => {
        const { orderId } = await cashOrder();

        const refunded = await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), {
            amount: 30
        });

        expect(refunded.success).toBe(true);
        const payment = await paymentOf(orderId);
        expect(payment.refunds[0].settledByHand).toBeUndefined();
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({ amount: 30, status: 'pending' });
        await settleOutboxNudges();
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_REFUNDED })).toBe(0);
        // Owed by hand, once, naming the record and written under the operator who asked.
        expect(owedRows()).toHaveLength(1);
        expect(owedRows()[0]).toMatchObject({
            targetType: 'order',
            targetId: orderId,
            metadata: { refundId: String(payment.refunds[0]._id), amount: 30, reason: 'goodwill' }
        });
        // The same fact is announced for `tickets`, in the transaction that opened the record.
        const [announced] = await outboxEventModel
            .find({ name: PAYMENT_REFUND_OWED_BY_HAND })
            .lean()
            .exec();
        expect(announced.payload).toEqual({
            paymentId: String(payment._id),
            orderId,
            refundId: String(payment.refunds[0]._id),
            amount: 30,
            currency: payment.currency
        });
    });
});

describe('the cancel listener on a cash payment', () => {
    it('opens one record and one owed row; a redelivery writes nothing more', async () => {
        const { orderId } = await cashOrder();

        await refundForOrder(orderId);
        await refundForOrder(orderId);

        const payment = await paymentOf(orderId);
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({ amount: 100, reason: 'cancellation' });
        expect(owedRows()).toHaveLength(1);
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_REFUND_OWED_BY_HAND })).toBe(
            1
        );
        // No caller behind the listener: the system is the actor.
        expect(owedRows()[0].metadata).toMatchObject({ refundId: String(payment.refunds[0]._id) });
    });

    it('still opens the rest when an operator refund of part of it is already waiting', async () => {
        const { orderId } = await cashOrder();
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), {
            amount: 30
        });

        await refundForOrder(orderId);

        const payment = await paymentOf(orderId);
        expect(payment.refunds.map((refund) => [refund.amount, refund.reason])).toEqual([
            [30, 'goodwill'],
            [70, 'cancellation']
        ]);
        expect(owedRows()).toHaveLength(2);
    });
});

describe('settleRefundByHand', () => {
    it('settles one named record: the event, the audit row and the flags all follow', async () => {
        const { orderId } = await cashOrder();
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), {
            amount: 30
        });
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), {
            amount: 20
        });
        const open = await paymentOf(orderId);
        const [first, second] = open.refunds.map((refund) => String(refund._id));

        const settled = await settle(String(open._id), second);

        expect(settled.success).toBe(true);
        const payment = await paymentOf(orderId);
        expect(payment.refunds.map((refund) => refund.status)).toEqual(['pending', 'succeeded']);
        expect(payment.refunds.map((refund) => refund.settledByHand)).toEqual([undefined, true]);
        // The other record is untouched and still the operator's to confirm.
        const read = await paymentService.getForOrder(orderId, asAdmin());
        expect(read.data?.actions?.settleByHand).toEqual([first]);
        await settleOutboxNudges();
        const events = await outboxEventModel.find({ name: PAYMENT_REFUNDED }).lean();
        expect(events).toHaveLength(1);
        expect(events[0].payload).toMatchObject({ orderId, refundId: second, amount: 20 });
        expect(audited.map(({ action }) => action)).toContain(
            'admin.payment.refund_settled_by_hand'
        );
        expect(audited.map(({ action }) => action)).not.toContain('admin.payment.refunded');
        // Confirming the money went back owes nothing new.
        expect(owedRows()).toHaveLength(2);
    });

    it('answers PAYMENT_REFUND_NOT_OPEN to a record that is already settled', async () => {
        const { orderId } = await cashOrder();
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'));
        const open = await paymentOf(orderId);
        const refundId = String(open.refunds[0]._id);
        await settle(String(open._id), refundId);

        const again = await settle(String(open._id), refundId);

        expect(asReject(again).status).toBe(409);
        expect(asReject(again).errors[0].code).toBe('PAYMENT_REFUND_NOT_OPEN');
        await settleOutboxNudges();
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_REFUNDED })).toBe(1);
    });

    it('answers PAYMENT_REFUND_IN_FLIGHT to a card refund the provider left unclear: the sweep owns it', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 50 });
        const order = await createOrder(user, [toOrderItem(product, 2)]);
        await payByCard(order, user);
        jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));
        await expect(
            refundOrderPayment(String(order._id), asAdmin(), callerContextAs('admin'))
        ).resolves.toMatchObject({ success: true, status: 201 });
        const payment = await paymentOf(String(order._id));

        const result = await settle(String(payment._id), String(payment.refunds[0]._id));

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_REFUND_IN_FLIGHT');
        const after = await paymentOf(String(order._id));
        expect(after.refunds[0].status).toBe('failed');
    });

    it('answers 404 for a refund id the payment does not carry', async () => {
        const { orderId } = await cashOrder();
        const payment = await paymentOf(orderId);

        const result = await settle(String(payment._id), '65f000000000000000000000');

        expect(asReject(result).status).toBe(404);
    });

    it('offers the record to settle to whoever holds create:Refund', async () => {
        const { orderId } = await cashOrder();
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'));

        const asOperator = await paymentService.getForOrder(orderId, asAdmin());
        const asMod = await paymentService.getForOrder(orderId, asModerator());

        expect(asOperator.data?.actions?.settleByHand).toHaveLength(1);
        // A moderator holds `create:Refund`; the flag follows the key, as `refund` does.
        expect(asMod.data?.actions?.settleByHand).toHaveLength(1);
    });
});

describe('refundDueAt', () => {
    it('is the record plus the attention window when the law sets no deadline', async () => {
        const { orderId } = await cashOrder();
        await refundForOrder(orderId);
        const payment = await paymentOf(orderId);
        const refund = payment.refunds[0];

        const dueAt = await paymentService.refundDueAt(String(payment._id), String(refund._id));

        expect(dueAt?.getTime()).toBe(
            refund.createdAt.getTime() + paymentAttentionMinutes() * 60_000
        );
    });

    it('is the legal 14 days for a refund that pays for a return', async () => {
        const { orderId } = await cashOrder();
        await refundForOrder(orderId);
        const payment = await paymentOf(orderId);
        const refund = payment.refunds[0];
        refund.returnId = 'return-1';
        await payment.save();

        const dueAt = await paymentService.refundDueAt(String(payment._id), String(refund._id));

        expect(dueAt?.getTime()).toBe(refund.createdAt.getTime() + 14 * 24 * 60 * 60_000);
    });

    it('is nothing for a refund that is not there', async () => {
        const { orderId } = await cashOrder();
        await refundForOrder(orderId);
        const payment = await paymentOf(orderId);

        await expect(
            paymentService.refundDueAt(String(payment._id), '65dc8a99604c307b702b5ccc')
        ).resolves.toBeUndefined();
    });
});
