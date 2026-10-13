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
import { createIntent, reconcileStalePayments } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { withEnvironment } from '@tests/environment';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer } from '@tests/callers';

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
    await createIntent(orderId, asCustomer(user.id));
    const payment = await paymentRepository.findByOrderId(orderId);
    await fakePaymentProvider.confirm(String(payment?.providerRef), 'pm_card_visa');
    return { user, orderId };
};

describe('reconcileStalePayments', () => {
    it('settles a payment the provider charged but never told us about', () =>
        withEnvironment('NODE_PAYMENT_RECONCILE_MINUTES', '0', async () => {
            const { orderId } = await chargedAtProvider();

            const moved = await reconcileStalePayments();

            expect(moved).toBe(1);
            const payment = await paymentRepository.findByOrderId(orderId);
            const order = await orderService.getById(orderId);
            expect([payment?.status, order?.status]).toEqual(['succeeded', 'paid']);
        }));

    it('leaves a payment younger than the grace window alone', async () => {
        const { orderId } = await chargedAtProvider();

        const moved = await reconcileStalePayments();

        expect(moved).toBe(0);
        const order = await orderService.getById(orderId);
        expect(order?.status).toBe('pending');
    });

    it('is a no-op once the payment has settled, so a late webhook and the sweep do not double up', () =>
        withEnvironment('NODE_PAYMENT_RECONCILE_MINUTES', '0', async () => {
            await chargedAtProvider();
            await reconcileStalePayments();

            expect(await reconcileStalePayments()).toBe(0);
        }));
});

describe('cancelling an order whose intent already succeeded at the provider', () => {
    it('returns the money that landed in the last minutes before the cancel', async () => {
        const { user, orderId } = await chargedAtProvider();

        const cancelled = await orderService.cancelById(orderId, asCustomer(user.id));

        expect(cancelled.success).toBe(true);
        // `order.cancelled` reaches the listener through the outbox, not inline.
        await settleOutboxNudges();
        const payment = await paymentRepository.findByOrderId(orderId);
        const order = await orderService.getById(orderId);
        expect([payment?.status, order?.status]).toEqual(['succeeded', 'cancelled']);
    });
});
