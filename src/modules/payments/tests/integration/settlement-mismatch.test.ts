/**
 * @module
 * A provider reporting `succeeded` for money that is not the payment we froze — another amount,
 * another currency, another payment's id. Nothing is accepted: the order is cancelled, the money
 * collected is returned through the existing refund path, no `payment.succeeded` is announced, no
 * stock is committed and no invoice is issued. Real Mongo throughout; the provider is the real
 * `fake` one, told what to collect through its receipt lever.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { SYSTEM_ACTOR } from '@kernel/permissions';
import { orderService } from '@modules/orders';
import invoicingModule from '@modules/invoicing/module';
import { findInvoiceForOrder } from '@modules/invoicing';
import {
    createIntent,
    confirmPayment,
    syncPayment,
    applyWebhookDelivery
} from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { PAYMENT_SUCCEEDED } from '@modules/payments/events';
import { paymentsAuditActions } from '@modules/payments/audit';
import { paymentAmountMismatchTotal } from '@modules/payments/metrics';
import { setFakeReceipt, fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asReject } from '@tests/response';
import { asCustomer, testCallerContext } from '@tests/callers';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { generateReject } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';

/*
 * The audit port is REPLACED, not spied on — see `orders/tests/integration/create-audit.test.ts`:
 * `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes.
 */
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, invoicingModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** The reference the demo's own panel sends — an opaque handle, never a card number. */
const GOOD_METHOD = 'pm_card_visa';

/** One customer, one 2-unit order at 25.00 each (50.00), an intent opened, nothing confirmed. */
const openIntent = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 25, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    const orderId = String(order._id);
    const intent = await createIntent(orderId, asCustomer(user.id));
    const payment = await paymentRepository.findByOrderId(orderId);
    return {
        user,
        product,
        orderId,
        paymentId: String(intent.success && intent.data?.id),
        providerRef: String(payment!.providerRef)
    };
};

/** What the provider can collect wrongly, one field at a time. */
const MISMATCHES = [
    ['amount', { amountReceived: 1 }],
    ['currency', { currency: 'USD' }],
    ['paymentId', { paymentId: '65dc8a99604c307b702b5ccc' }]
] as const;

describe.each(MISMATCHES)('a provider success whose %s is not the one frozen', (field, receipt) => {
    it('cancels the order, returns the money once, and pays nothing — answering 409 to the confirm', async () => {
        const { user, product, orderId, paymentId, providerRef } = await openIntent();
        setFakeReceipt(providerRef, receipt);

        const result = await confirmPayment(
            paymentId,
            GOOD_METHOD,
            asCustomer(user.id),
            testCallerContext
        );
        await settleOutboxNudges();

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
        expect((await orderService.getById(orderId))!.status).toBe('cancelled');
        const payment = await paymentRepository.findByOrderId(orderId);
        expect(payment!.status).toBe('refunded');
        expect(payment!.refunds).toHaveLength(1);
        // Nothing was paid: no announcement, no invoice, and the units are back on the shelf.
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_SUCCEEDED })).toBe(0);
        expect(await findInvoiceForOrder(orderId)).toBeNull();
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 0, available: 10 });
        // The field that differed is what the counter and the audit row name.
        const counted = await paymentAmountMismatchTotal.get();
        expect(
            counted.values.some((value) => value.labels.field === field && value.value > 0)
        ).toBe(true);
    });
});

describe('a mismatch recorded', () => {
    it('writes what ARRIVED over the frozen figures, so the refund returns what was collected', async () => {
        const { user, orderId, paymentId, providerRef } = await openIntent();
        setFakeReceipt(providerRef, { amountReceived: 47.5 });

        await confirmPayment(paymentId, GOOD_METHOD, asCustomer(user.id), testCallerContext);

        const payment = await paymentRepository.findByOrderId(orderId);
        expect(payment!.amount).toBe(47.5);
        expect(payment!.refunds[0].amount).toBe(47.5);
    });

    it('is audited as payment.amount_mismatch by the system actor, not under security.*', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const { user, paymentId, providerRef } = await openIntent();
        setFakeReceipt(providerRef, { currency: 'USD' });

        await confirmPayment(paymentId, GOOD_METHOD, asCustomer(user.id), testCallerContext);

        expect(paymentsAuditActions.PAYMENT_AMOUNT_MISMATCH.startsWith('security.')).toBe(false);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'payment.amount_mismatch',
                outcome: 'failure',
                target_type: 'payment',
                target_id: paymentId,
                actor_user_id: SYSTEM_ACTOR.id,
                metadata: expect.objectContaining({
                    fields: ['currency'],
                    received: expect.objectContaining({ currency: 'USD' })
                })
            })
        );
    });

    it('does not spend a decline: the order-not-payable answer is not PAYMENT_DECLINED', async () => {
        const { user, paymentId, providerRef } = await openIntent();
        setFakeReceipt(providerRef, { amountReceived: 1 });

        const result = await confirmPayment(
            paymentId,
            GOOD_METHOD,
            asCustomer(user.id),
            testCallerContext
        );

        expect(asReject(result).errors.map(({ code }) => code)).not.toContain('PAYMENT_DECLINED');
    });
});

describe('the other doors into the same settlement', () => {
    it('answers the sync 409 when the browser reports a mismatched success', async () => {
        const { user, orderId, paymentId, providerRef } = await openIntent();
        await fakePaymentProvider.confirm(providerRef, GOOD_METHOD);
        setFakeReceipt(providerRef, { amountReceived: 1 });

        const result = await syncPayment(paymentId, asCustomer(user.id), testCallerContext);

        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
        expect((await orderService.getById(orderId))!.status).toBe('cancelled');
        expect((await paymentRepository.findByOrderId(orderId))!.status).toBe('refunded');
    });

    it('acknowledges the webhook delivery, and still cancels and refunds', async () => {
        const { orderId, providerRef } = await openIntent();
        await fakePaymentProvider.confirm(providerRef, GOOD_METHOD);
        setFakeReceipt(providerRef, { amountReceived: 1 });

        await expect(
            applyWebhookDelivery({ id: 'evt_mismatch', providerRef })
        ).resolves.toBeUndefined();

        expect((await orderService.getById(orderId))!.status).toBe('cancelled');
        expect((await paymentRepository.findByOrderId(orderId))!.status).toBe('refunded');
    });

    it('treats a success that reports no figures at all as unverifiable, and refuses it', async () => {
        const { user, orderId, paymentId, providerRef } = await openIntent();
        // An adapter that forgot to report what it collected.
        jest.spyOn(fakePaymentProvider, 'confirm').mockResolvedValueOnce({ status: 'succeeded' });
        expect(providerRef).toBeTruthy();

        const result = await confirmPayment(
            paymentId,
            GOOD_METHOD,
            asCustomer(user.id),
            testCallerContext
        );

        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
        expect((await orderService.getById(orderId))!.status).toBe('cancelled');
    });
});

describe('a matching success', () => {
    it('is accepted exactly as before — the check costs an honest payment nothing', async () => {
        const { user, orderId, paymentId } = await openIntent();

        const result = await confirmPayment(
            paymentId,
            GOOD_METHOD,
            asCustomer(user.id),
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect((await orderService.getById(orderId))!.status).toBe('paid');
        expect((await paymentRepository.findByOrderId(orderId))!.status).toBe('succeeded');
    });

    it('tolerates float noise: 50.000000001 collected for 50.00 frozen is the same minor units', async () => {
        const { user, orderId, paymentId, providerRef } = await openIntent();
        setFakeReceipt(providerRef, { amountReceived: 50 + 1e-9 });

        const result = await confirmPayment(
            paymentId,
            GOOD_METHOD,
            asCustomer(user.id),
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect((await orderService.getById(orderId))!.status).toBe('paid');
    });
});

describe('a crash after the mismatch was recorded', () => {
    it('is finished by the reservation-expiry cancel: the order cancels and the money returns', async () => {
        const { user, orderId, paymentId, providerRef } = await openIntent();
        setFakeReceipt(providerRef, { amountReceived: 1 });
        // The process dies between the payment write and the cancel: the cancel never runs.
        jest.spyOn(orderService, 'cancelById').mockRejectedValueOnce(new Error('process died'));

        const result = await confirmPayment(
            paymentId,
            GOOD_METHOD,
            asCustomer(user.id),
            testCallerContext
        );

        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
        expect((await orderService.getById(orderId))!.status).toBe('pending');
        expect((await paymentRepository.findByOrderId(orderId))!.status).toBe('succeeded');

        // The expiry sweep cancels the still-pending order exactly as it does for any hold.
        jest.restoreAllMocks();
        await orderService.cancelById(orderId, SYSTEM_ACTOR, {}, undefined, true);

        expect((await orderService.getById(orderId))!.status).toBe('cancelled');
        expect((await paymentRepository.findByOrderId(orderId))!.status).toBe('refunded');
        expect(user.id).toBeTruthy();
    });

    it('puts the money back directly when the cancel is refused, instead of keeping it', async () => {
        const { user, orderId, paymentId, providerRef } = await openIntent();
        setFakeReceipt(providerRef, { amountReceived: 1 });
        // The order moved on by itself an instant before: the cancel finds nothing to cancel.
        jest.spyOn(orderService, 'cancelById').mockResolvedValueOnce(
            generateReject(409, [
                { code: 'ORDER_NOT_CANCELLABLE', message: t('orders.cancel.not-cancellable') }
            ])
        );

        await confirmPayment(paymentId, GOOD_METHOD, asCustomer(user.id), testCallerContext);

        expect((await paymentRepository.findByOrderId(orderId))!.status).toBe('refunded');
    });
});
