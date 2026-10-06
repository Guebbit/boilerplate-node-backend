/**
 * @module
 * The documented residual of `applyWebhookDelivery`: a crash between `claimWebhookEvent` and the
 * settlement (or its release) strands the event id, so the provider's redeliveries are all
 * swallowed as duplicates. The invariant that must still hold is that money charged at the
 * provider is never lost: the browser's own `syncPayment` re-reads the provider and applies it.
 *
 * The crash is modelled by what it leaves behind: the claim row, and nothing else.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { orderService } from '@modules/orders';
import { applyWebhookDelivery, createIntent, syncPayment } from '@modules/payments/services';
import { claimWebhookEvent, paymentRepository } from '@modules/payments/repository';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, testCallerContext } from '@tests/callers';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
});

describe('a webhook event id stranded by a crash after its claim', () => {
    it('swallows the provider redelivery, and the next sync still applies the payment', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 25, onHand: 10 });
        const order = await createOrder(user, [toOrderItem(product, 2)]);
        const orderId = String(order._id);
        const intent = await createIntent(orderId, asCustomer(user.id));
        const payment = await paymentRepository.findByOrderId(orderId);
        const providerRef = String(payment?.providerRef);
        // The provider took the money, then this process died holding the webhook's claim.
        await fakePaymentProvider.confirm(providerRef, 'pm_card_visa');
        await claimWebhookEvent('evt_stranded');

        await applyWebhookDelivery({ id: 'evt_stranded', providerRef });

        // The redelivery was treated as a duplicate: nothing applied.
        const strandedPayment = await paymentRepository.findByOrderId(orderId);
        const strandedOrder = await orderService.getById(orderId);
        expect(strandedPayment?.status).not.toBe('succeeded');
        expect(strandedOrder?.status).toBe('pending');

        const synced = await syncPayment(
            String(intent.success && intent.data?.id),
            asCustomer(user.id),
            testCallerContext
        );

        expect(synced.success).toBe(true);
        const settledPayment = await paymentRepository.findByOrderId(orderId);
        const settledOrder = await orderService.getById(orderId);
        expect(settledPayment?.status).toBe('succeeded');
        expect(settledOrder?.status).toBe('paid');
    });
});
