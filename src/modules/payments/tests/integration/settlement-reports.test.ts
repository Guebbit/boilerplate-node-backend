/**
 * @module
 * What a settlement REPORTS — `payment.failed`, the audit row and the analytics event — happens
 * once per real transition. A confirm and the webhook for the same decline, or a poll of a payment
 * that already succeeded, must not announce the same fact twice; two different cards declined in
 * turn are two attempts and stay two. Real Mongo throughout.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { PAYMENT_FAILED } from '@modules/payments/events';
import { paymentsAuditActions } from '@modules/payments/audit';
import { paymentsAnalyticsEvents } from '@modules/payments/analytics';
import paymentsModule from '@modules/payments/module';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { observePort } from '@tests/ports';
import { asCustomer, testCallerContext, callerContextAs } from '@tests/callers';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';

/* Replaced, not spied on — see `tests/support/ports.ts` for why. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);
jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/analytics'),
    emitAnalyticsEvent: jest.fn()
}));

setupTestDb();

beforeEach(() => registerCheckoutModules([paymentsModule]));

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A placed order with a card intent nobody has confirmed. */
const openIntent = async () => {
    const user = await createUser();
    const product = await createProduct({ onHand: 10 });
    const created = await orderService.create(
        user.id,
        user.email,
        [{ productId: String(product._id), quantity: 2 }],
        callerContextAs('admin')
    );
    const orderId = String(created.data?._id);
    const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
    return { user, orderId, paymentId: String(intent.success && intent.data?.id) };
};

/** Confirm the payment with `method` as its owner. */
const confirmWith = (
    paymentId: string,
    user: { id: string },
    method: string
): ReturnType<typeof paymentService.confirmPayment> =>
    paymentService.confirmPayment(paymentId, method, asCustomer(user.id), testCallerContext);

/** How many `payment.failed` rows the outbox holds, once the relay has settled. */
const failedRows = (): Promise<number> =>
    settleOutboxNudges().then(() => outboxEventModel.countDocuments({ name: PAYMENT_FAILED }));

describe('a declined payment', () => {
    it('is announced once when the webhook for the same attempt follows the confirm', async () => {
        const { user, orderId, paymentId } = await openIntent();
        await confirmWith(paymentId, user, 'pm_card_declined');
        const payment = await paymentRepository.findByOrderId(orderId);
        const providerRef = String(payment?.providerRef);

        await paymentService.applyWebhookSettlement(providerRef);
        await paymentService.syncPayment(paymentId, asCustomer(user.id), testCallerContext);

        expect(await failedRows()).toBe(1);
    });

    it('is announced once per attempt: card A declined, then card B declined, are two', async () => {
        const { user, paymentId } = await openIntent();

        await confirmWith(paymentId, user, 'pm_card_declined');
        await confirmWith(paymentId, user, 'pm_card_declined');

        expect(await failedRows()).toBe(2);
    });

    it('is audited and counted once, however often it is polled', async () => {
        const { user, paymentId } = await openIntent();
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);

        await confirmWith(paymentId, user, 'pm_card_declined');
        await paymentService.syncPayment(paymentId, asCustomer(user.id), testCallerContext);
        await paymentService.syncPayment(paymentId, asCustomer(user.id), testCallerContext);

        const failures = auditSpy.mock.calls.filter(
            ([event]) => event.action === paymentsAuditActions.PAYMENT_FAILED
        );
        expect(failures).toHaveLength(1);
        const declines = analyticsSpy.mock.calls.filter(
            ([event]) => event.event === paymentsAnalyticsEvents.PAYMENT_DECLINED
        );
        expect(declines).toHaveLength(1);
    });
});

describe('a payment that already succeeded', () => {
    it('is audited and counted once, however often it is synced', async () => {
        const { user, paymentId } = await openIntent();
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);

        await confirmWith(paymentId, user, 'pm_card_visa');
        await paymentService.syncPayment(paymentId, asCustomer(user.id), testCallerContext);
        await paymentService.syncPayment(paymentId, asCustomer(user.id), testCallerContext);

        const confirmed = auditSpy.mock.calls.filter(
            ([event]) => event.action === paymentsAuditActions.PAYMENT_CONFIRMED
        );
        expect(confirmed).toHaveLength(1);
        const succeeded = analyticsSpy.mock.calls.filter(
            ([event]) => event.event === paymentsAnalyticsEvents.PAYMENT_SUCCEEDED
        );
        expect(succeeded).toHaveLength(1);
    });
});

describe('a confirm that loses the race', () => {
    it('answers what the payment now is, not the stale pre-read', async () => {
        const { user, orderId, paymentId } = await openIntent();
        const confirm = fakePaymentProvider.confirm.bind(fakePaymentProvider);
        // The webhook wins while the provider is still answering this confirm.
        jest.spyOn(fakePaymentProvider, 'confirm').mockImplementationOnce((ref, method) =>
            confirm(ref, method).then((state) =>
                paymentRepository
                    .updateStatusIfIn(orderId, ['requires_confirmation'], 'succeeded')
                    .then(() => state)
            )
        );

        const result = await confirmWith(paymentId, user, 'pm_card_visa');

        expect(result.success && result.data.status).toBe('succeeded');
    });
});
