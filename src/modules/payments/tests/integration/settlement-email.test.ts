/**
 * @module
 * A payment settling to `succeeded` mails the buyer: the placed-order confirmation only says the
 * order was received, never that it was paid. This pins that the `payment.succeeded` listener sends
 * {@link paymentReceivedEmail}, and only on the write that
 * actually commits the stock (never on a decline, or a retry of an already-settled payment).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { createIntent, confirmPayment } from '@modules/payments/services';
import { FAKE_DECLINE_METHOD } from '@scenarios/support/doubles/payments/fake';
import paymentsModule from '@modules/payments/module';
import { resetDomainEvents } from '@kernel/events';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, testCallerContext } from '@tests/callers';
import { eventually } from '@tests/eventually';
import { settleOutboxNudges } from '@kernel/outbox';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockClear();
    registerCheckoutModules([paymentsModule]);
});
afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** The reference the demo's own panel sends — an opaque handle, never a card number. */
const GOOD_METHOD = 'pm_card_visa';

/** One customer with one order, ready to pay for it. */
const orderFor = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 25 });
    const order = await createOrder(user, [toOrderItem(product, 1)]);
    return { user, order };
};

/** Whether a payment-succeeded mail has been enqueued so far. */
const paidMailSent = (): boolean =>
    mockEnqueueEmail.mock.calls.some(([, template]) => template === 'payments.payment-received');

describe('payment succeeded — the customer gets an email', () => {
    it('mails the buyer once the payment settles and the stock actually commits', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), asCustomer(user.id));

        await confirmPayment(
            String((intent as { data?: { id?: string } }).data?.id),
            GOOD_METHOD,
            asCustomer(user.id),
            testCallerContext
        );
        // The mail send is fire-and-forget and its first step is a real Mongo read, so it does not
        // settle within one tick of `confirmPayment` resolving.
        await eventually(paidMailSent);

        const [envelope] = mockEnqueueEmail.mock.calls.find(
            ([, template]) => template === 'payments.payment-received'
        )!;
        expect(envelope.to).toBe(order.email);
    });

    it('sends no payment-succeeded mail for a declined attempt', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), asCustomer(user.id));

        await confirmPayment(
            String((intent as { data?: { id?: string } }).data?.id),
            FAKE_DECLINE_METHOD,
            asCustomer(user.id),
            testCallerContext
        );
        // Nothing to wait ON here — a decline never reaches the mail send at all — so this proves
        // absence by giving any straggler every chance to show up before asserting it did not.
        await settleOutboxNudges();

        expect(paidMailSent()).toBe(false);
    });

    it('sends only one payment-succeeded mail even if confirm is called again for the same payment', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const paymentId = String((intent as { data?: { id?: string } }).data?.id);

        await confirmPayment(paymentId, GOOD_METHOD, asCustomer(user.id), testCallerContext);
        // The mail send is fire-and-forget and its first step is a real Mongo read, so it does not
        // settle within one tick of `confirmPayment` resolving.
        await eventually(paidMailSent);
        // Already `succeeded` — `SETTLEABLE_PAYMENT_STATUSES` excludes it, so this retry settles
        // nothing new; it must not re-mail the customer a second "payment received".
        await confirmPayment(paymentId, GOOD_METHOD, asCustomer(user.id), testCallerContext);
        await settleOutboxNudges();

        const paidCalls = mockEnqueueEmail.mock.calls.filter(
            ([, template]) => template === 'payments.payment-received'
        );
        expect(paidCalls).toHaveLength(1);
    });
});
