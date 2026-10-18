/**
 * @module
 * A webhook the provider never delivered must not strand money: the reconciliation sweep asks the
 * provider about stale unsettled payments, and the cancel path asks it once when the provider
 * refuses to close an intent that already succeeded.
 *
 * The provider's side is the fake PSP; "lost webhook" is modelled by confirming at the provider
 * and never telling the application.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { withEnvironmentOverrides } from '@tests/environment';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, testCallerContext } from '@tests/callers';
import { reservationRepository } from '@modules/inventory/tests/factories';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
});

/** An order with an open intent the provider has already charged, and no webhook seen. */
const chargedAtProvider = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 25, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    const orderId = String(order._id);
    await paymentService.createIntent(orderId, asCustomer(user.id));
    const payment = await paymentRepository.findByOrderId(orderId);
    await fakePaymentProvider.confirm(String(payment?.providerRef), 'pm_card_visa');
    return { user, orderId };
};

describe('reconcileStalePayments', () => {
    it('settles a payment the provider charged but never told us about', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_RECONCILE_MINUTES: '0' }, async () => {
            const { orderId } = await chargedAtProvider();

            const moved = await paymentService.reconcileStalePayments();

            expect(moved).toBe(1);
            const payment = await paymentRepository.findByOrderId(orderId);
            const order = await orderService.getById(orderId);
            expect([payment?.status, order?.status]).toEqual(['succeeded', 'paid']);
        }));

    // One pass is bounded so a backlog cannot hold the sweep's lease for ever; a full batch is
    // said out loud and the next run continues.
    it('asks for at most 200 payments per run', async () => {
        const find = jest.spyOn(paymentRepository, 'findStaleInFlight').mockResolvedValue([]);

        await paymentService.reconcileStalePayments();

        expect(find).toHaveBeenCalledWith(expect.any(Date), 200);
        find.mockRestore();
    });

    it('leaves a payment younger than the grace window alone', async () => {
        const { orderId } = await chargedAtProvider();

        const moved = await paymentService.reconcileStalePayments();

        expect(moved).toBe(0);
        const order = await orderService.getById(orderId);
        expect(order?.status).toBe('pending');
    });

    it('is a no-op once the payment has settled, so a late webhook and the sweep do not double up', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_RECONCILE_MINUTES: '0' }, async () => {
            await chargedAtProvider();
            await paymentService.reconcileStalePayments();

            expect(await paymentService.reconcileStalePayments()).toBe(0);
        }));
});

/** The payment's status for an order, or `undefined` when it has none. */
const paymentStatusOf = (orderId: string) =>
    paymentRepository.findByOrderId(orderId).then((payment) => payment?.status);

/** The order's status, or `undefined` when it is gone. */
const orderStatusOf = (orderId: string) =>
    orderService.getById(orderId).then((order) => order?.status);

/** An order with an intent prepared and nothing attempted: the card was never presented. */
const unconfirmedIntent = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 25, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    const orderId = String(order._id);
    const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
    return { user, orderId, paymentId: String(intent.success && intent.data?.id) };
};

describe('reconcileStalePayments, on a payment nobody attempted or that stopped', () => {
    it('leaves an unconfirmed intent alone: the provider has no attempt on record', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_RECONCILE_MINUTES: '0' }, async () => {
            const { orderId } = await unconfirmedIntent();
            const before = await reservationRepository.findByOrderId(orderId);

            const moved = await paymentService.reconcileStalePayments();

            expect(moved).toBe(0);
            expect(await paymentStatusOf(orderId)).toBe('requires_confirmation');
            // The window a card payment gets is not stretched to the bank-transfer week.
            const after = await reservationRepository.findByOrderId(orderId);
            expect(after?.expiresAt).toEqual(before?.expiresAt);
        }));

    it('does not turn an open answer into a decline on a payment that was declined', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_RECONCILE_MINUTES: '0' }, async () => {
            const { user, orderId, paymentId } = await unconfirmedIntent();
            await paymentService.confirmPayment(
                paymentId,
                'pm_card_declined',
                asCustomer(user.id),
                testCallerContext
            );
            const asked = jest
                .spyOn(fakePaymentProvider, 'retrieve')
                .mockResolvedValue({ status: 'open' });

            const moved = await paymentService.reconcileStalePayments();

            expect(asked).toHaveBeenCalled();
            expect(moved).toBe(0);
            expect(await paymentStatusOf(orderId)).toBe('declined');
            asked.mockRestore();
        }));

    it('still settles a payment stuck at requires_action once the provider has succeeded', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_RECONCILE_MINUTES: '0' }, async () => {
            const { user, orderId, paymentId } = await unconfirmedIntent();
            await paymentService.confirmPayment(
                paymentId,
                'pm_card_authentication_required',
                asCustomer(user.id),
                testCallerContext
            );
            expect(await paymentStatusOf(orderId)).toBe('requires_action');

            const moved = await paymentService.reconcileStalePayments();

            expect(moved).toBe(1);
            expect(await paymentStatusOf(orderId)).toBe('succeeded');
            expect(await orderStatusOf(orderId)).toBe('paid');
        }));
});

describe('cancelling an order whose intent already succeeded at the provider', () => {
    it('returns the money that landed in the last minutes before the cancel', async () => {
        const { user, orderId } = await chargedAtProvider();

        const cancelled = await orderService.cancelOnRequestById(orderId, asCustomer(user.id));

        expect(cancelled.success).toBe(true);
        // `order.cancelled` reaches the listener through the outbox, not inline.
        await settleOutboxNudges();
        const payment = await paymentRepository.findByOrderId(orderId);
        const order = await orderService.getById(orderId);
        expect([payment?.status, order?.status]).toEqual(['succeeded', 'cancelled']);
    });
});
