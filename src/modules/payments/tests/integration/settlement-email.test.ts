/**
 * @module
 * E5's leftover: a payment settling to `succeeded` used to mail nobody — the placed-order
 * confirmation only ever said the order was received, never that it was paid. This pins that
 * `settlePayment`'s happy path now sends {@link paymentSucceededEmail}, and only on the write that
 * actually commits the stock (never on a decline, or a retry of an already-settled payment).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { createIntent, confirmPayment } from '@modules/payments/services';
import { FAKE_DECLINE_METHOD } from '@modules/payments/providers/fake';
import { asCustomer, testCallerContext } from '@tests/callers';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => mockEnqueueEmail.mockClear());
afterEach(() => jest.restoreAllMocks());

/** The reference the demo's own panel sends — an opaque handle, never a card number. */
const GOOD_METHOD = 'pm_card_visa';

/**
 * Waits for `predicate` to turn true, polling rather than a single microtask flush — the mail
 * send is fire-and-forget (`void mailBuyer(...)`, same reasoning as the `PAYMENT_SUCCEEDED` event
 * beside it) and its own first step is a REAL Mongo read (`userService.getById`), which does not
 * necessarily settle within one `setImmediate` tick of `confirmPayment`'s own promise resolving.
 * @throws {Error} if `predicate` never turns true within `timeoutMs`
 */
const waitUntil = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) throw new Error('waitUntil: timed out');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

/** One customer with one order, ready to pay for it. */
const orderFor = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 25 });
    const order = await createOrder(user, [toOrderItem(product, 1)]);
    return { user, order };
};

/** Whether a payment-succeeded mail has been enqueued so far. */
const paidMailSent = (): boolean =>
    mockEnqueueEmail.mock.calls.some(([, template]) => template === 'orders.order-paid');

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
        await waitUntil(paidMailSent);

        const [envelope] = mockEnqueueEmail.mock.calls.find(
            ([, template]) => template === 'orders.order-paid'
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
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(paidMailSent()).toBe(false);
    });

    it('sends only one payment-succeeded mail even if confirm is called again for the same payment', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const paymentId = String((intent as { data?: { id?: string } }).data?.id);

        await confirmPayment(paymentId, GOOD_METHOD, asCustomer(user.id), testCallerContext);
        await waitUntil(paidMailSent);
        // Already `succeeded` — `SETTLEABLE_PAYMENT_STATUSES` excludes it, so this retry settles
        // nothing new; it must not re-mail the customer a second "payment received".
        await confirmPayment(paymentId, GOOD_METHOD, asCustomer(user.id), testCallerContext);
        await new Promise((resolve) => setTimeout(resolve, 100));

        const paidCalls = mockEnqueueEmail.mock.calls.filter(
            ([, template]) => template === 'orders.order-paid'
        );
        expect(paidCalls).toHaveLength(1);
    });
});
