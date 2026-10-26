/**
 * @module
 * Staff voiding a refund that must never be paid. Only money that provably did not move may be
 * voided (a hand-paid `pending` record, a card refusal that is clear); a settled refund, an
 * unclear failure and an attempt in flight are refused. A voided refund releases its share, mails
 * no one, issues no credit note and is never sent. Real Mongo, through the services' public door.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem, timelineOf } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { PAYMENT_REFUNDED, PAYMENT_REFUND_CANCELED } from '@modules/payments/events';
import paymentsModule from '@modules/payments/module';
import {
    fakePaymentProvider,
    setFakeRefundFailure
} from '@scenarios/support/doubles/payments/fake';
import { withEnvironmentOverrides } from '@tests/environment';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { asAdmin, callerContextAs } from '@tests/callers';
import { asReject } from '@tests/response';
import { payByCard, refundOrderPayment } from '@modules/payments/tests/factories';
import type { RefundFailureReason } from '@types';

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

/** A fresh order of 100.00 (two units at 50.00). */
const freshOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    return { user, order, orderId: String(order._id) };
};

/** The stored payment behind an order. */
const paymentOf = async (orderId: string) => {
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw new Error('no payment');
    return payment;
};

/** A cash payment of 100.00 with a hand-paid refund of 30.00 waiting (`pending`). */
const cashRefund = async () => {
    const { orderId } = await freshOrder();
    await paymentService.recordOfflinePayment(
        orderId,
        { method: 'cash' },
        callerContextAs('admin')
    );
    await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 });
    const payment = await paymentOf(orderId);
    return { orderId, payment, refundId: String(payment.refunds[0]._id) };
};

/** A card payment of 100.00 whose first refund of 30.00 the provider refuses with `reason`. */
const refusedRefund = async (reason: RefundFailureReason) => {
    const { user, order, orderId } = await freshOrder();
    await payByCard(order, user);
    await settleOutboxNudges();
    const before = await paymentOf(orderId);
    setFakeRefundFailure(String(before.providerRef), reason);
    await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 });
    const payment = await paymentOf(orderId);
    return { orderId, payment, refundId: String(payment.refunds[0]._id) };
};

/** The operator's cancel. */
const cancel = (paymentId: string, refundId: string, note = 'refunded in the dashboard too') =>
    paymentService.cancelRefund(paymentId, refundId, note, asAdmin(), callerContextAs('admin'));

describe('cancelling a hand-paid refund that waits', () => {
    it('closes the record, releases its share and writes the audit, the timeline and the event once', async () => {
        const { orderId, payment, refundId } = await cashRefund();
        expect(payment.amountRefunded).toBe(30);

        const result = await cancel(String(payment._id), refundId);

        expect(result.success).toBe(true);
        const after = await paymentOf(orderId);
        expect(after.refunds[0]).toMatchObject({ status: 'failed', failureReason: 'canceled' });
        expect(after.refunds[0].settledByHand).toBeUndefined();
        expect(after.amountRefunded).toBe(0);
        await settleOutboxNudges();
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_REFUND_CANCELED })).toBe(1);
        expect(audited.filter(({ action }) => action === 'admin.payment.refund_canceled')).toEqual([
            expect.objectContaining({
                targetId: orderId,
                metadata: { refundId, amount: 30, note: 'refunded in the dashboard too' }
            })
        ]);
        const rows = await timelineOf(orderId, 'refund_canceled');
        expect(rows).toHaveLength(1);
        expect(JSON.stringify(rows[0])).not.toContain('dashboard');
    });

    it('issues no credit note, mails nobody and announces no refund', async () => {
        const { payment, refundId } = await cashRefund();

        await cancel(String(payment._id), refundId);

        await settleOutboxNudges();
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_REFUNDED })).toBe(0);
    });

    it('is offered in actions while open, and no longer once canceled', async () => {
        const { orderId, payment, refundId } = await cashRefund();
        const before = await paymentService.getForOrder(orderId, asAdmin());
        expect(before.data?.actions?.cancelRefund).toEqual([refundId]);

        await cancel(String(payment._id), refundId);

        const after = await paymentService.getForOrder(orderId, asAdmin());
        expect(after.data?.actions?.cancelRefund).toEqual([]);
        expect(after.data?.actions?.settleByHand).toEqual([]);
        expect(after.data?.actions?.refund).toBe(true);
        expect(after.data?.displayStatus).toBe('succeeded');
    });

    it('lets the released share be refunded again', async () => {
        const { orderId, payment, refundId } = await cashRefund();
        await cancel(String(payment._id), refundId);

        const again = await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), {
            amount: 100
        });

        expect(again.success).toBe(true);
        const after = await paymentOf(orderId);
        expect(after.amountRefunded).toBe(100);
    });

    it('answers 409 PAYMENT_REFUND_NOT_OPEN to a second cancel and writes nothing more', async () => {
        const { payment, refundId } = await cashRefund();
        await cancel(String(payment._id), refundId);
        audited = [];

        const second = await cancel(String(payment._id), refundId);

        expect(asReject(second).status).toBe(409);
        expect(asReject(second).errors[0].code).toBe('PAYMENT_REFUND_NOT_OPEN');
        expect(audited).toHaveLength(0);
    });

    it('cannot be settled by hand afterwards', async () => {
        const { payment, refundId } = await cashRefund();
        await cancel(String(payment._id), refundId);

        const settled = await paymentService.settleRefundByHand(
            String(payment._id),
            refundId,
            asAdmin(),
            callerContextAs('admin')
        );

        expect(asReject(settled).errors[0].code).toBe('PAYMENT_REFUND_NOT_OPEN');
    });

    it('answers 404 for an unknown refund', async () => {
        const { payment } = await cashRefund();

        const result = await cancel(String(payment._id), '64b64b64b64b64b64b64b64b');

        expect(asReject(result).status).toBe(404);
    });

    it('reads a payment with only a canceled refund as plainly succeeded, and refunded in full once the rest goes', async () => {
        const { orderId, payment, refundId } = await cashRefund();
        await cancel(String(payment._id), refundId);
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 100 });
        const second = await paymentOf(orderId);
        const owed = second.refunds[1];

        await paymentService.settleRefundByHand(
            String(payment._id),
            String(owed._id),
            asAdmin(),
            callerContextAs('admin')
        );

        const read = await paymentService.getForOrder(orderId, asAdmin());
        expect(read.data?.displayStatus).toBe('refunded');
    });
});

describe.each(['declined', 'insufficient_funds'] as const)(
    'cancelling a card refund refused as %s',
    (reason) => {
        it('voids it, and the sweep never sends it', () =>
            withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
                const { orderId, payment, refundId } = await refusedRefund(reason);

                const result = await cancel(String(payment._id), refundId);

                expect(result.success).toBe(true);
                const after = await paymentOf(orderId);
                expect(after.refunds[0]).toMatchObject({
                    status: 'failed',
                    failureReason: 'canceled'
                });
                expect(after.amountRefunded).toBe(0);
                const spy = jest.spyOn(fakePaymentProvider, 'refund').mockClear();
                await paymentService.retryOpenRefunds();
                expect(spy).not.toHaveBeenCalled();
                const attention = await paymentService.listAttention();
                expect(attention.items).toEqual([]);
            }));
    }
);

describe.each(['provider_unavailable', 'unknown'] as const)(
    'cancelling a card refund left unclear as %s',
    (reason) => {
        it('answers 409 PAYMENT_REFUND_IN_FLIGHT and changes nothing', async () => {
            const { orderId, payment, refundId } = await refusedRefund(reason);

            const result = await cancel(String(payment._id), refundId);

            expect(asReject(result).errors[0].code).toBe('PAYMENT_REFUND_IN_FLIGHT');
            const after = await paymentOf(orderId);
            expect(after.refunds[0]).toMatchObject({ status: 'failed', failureReason: reason });
            expect(after.amountRefunded).toBe(30);
            const offered = await paymentService.getForOrder(orderId, asAdmin());
            expect(offered.data?.actions?.cancelRefund).toEqual([]);
        });
    }
);

describe('cancelling a refund that already paid out', () => {
    it('answers 409 PAYMENT_REFUND_NOT_OPEN: the money moved', async () => {
        const { user, order, orderId } = await freshOrder();
        await payByCard(order, user);
        await settleOutboxNudges();
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 });
        const payment = await paymentOf(orderId);
        expect(payment.refunds[0].status).toBe('succeeded');

        const result = await cancel(String(payment._id), String(payment.refunds[0]._id));

        expect(asReject(result).errors[0].code).toBe('PAYMENT_REFUND_NOT_OPEN');
        const after = await paymentOf(orderId);
        expect(after.amountRefunded).toBe(30);
    });
});

describe('cancelling against a racing sweep', () => {
    it('answers 409 PAYMENT_REFUND_IN_FLIGHT when the record was claimed between read and write', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, payment, refundId } = await refusedRefund('insufficient_funds');
            const cancelWrite = paymentRepository.cancelRefund.bind(paymentRepository);
            jest.spyOn(paymentRepository, 'cancelRefund').mockImplementationOnce(
                async (...args) => {
                    await paymentRepository.claimRefund(String(payment._id), refundId, {
                        now: new Date(),
                        staleBefore: new Date(0)
                    });
                    return cancelWrite(...args);
                }
            );

            const result = await cancel(String(payment._id), refundId);

            expect(asReject(result).errors[0].code).toBe('PAYMENT_REFUND_IN_FLIGHT');
            const after = await paymentOf(orderId);
            expect(after.refunds[0].status).toBe('pending');
            expect(after.amountRefunded).toBe(30);
        }));
});
