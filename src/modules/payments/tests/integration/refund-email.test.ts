/**
 * @module
 * Money going back is never silent: a refund that settles OUTSIDE a return mails the buyer
 * `payments.refund-issued`. A return's refund is announced by `returns`' own closing notice, and a
 * refund the provider refused moved no money, so neither mails here. Same fire-and-forget shape as
 * `settlement-email.test.ts`: the send starts with a real Mongo read, so presence is polled for
 * and absence is shown by giving a straggler time to appear.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { orderService } from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import { resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { refundByOrder, refundForReturn } from '@modules/payments/services';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, asAdmin, testCallerContext, callerContextAs } from '@tests/callers';
import { eventually } from '@tests/eventually';
import { payByCard } from '@modules/payments/tests/factories';

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

/**
 * Waits for `done`, letting each poll deliver the outbox pass that started meanwhile — the mail
 * rides the outbox.
 */
const waitForMails = (done: () => boolean): Promise<void> =>
    eventually(() => settleOutboxNudges().then(done));

/** The mails queued so far under one template name. */
const mailsOf = (template: string) =>
    mockEnqueueEmail.mock.calls.filter(([, name]) => name === template);

/** The template data of the first mail queued under `template`; the slots read here are strings. */
const dataOf = (template: string): Record<string, string> => {
    const [call] = mailsOf(template);
    return call[2];
};

/** A customer who paid 100.00 by card: one product at 50.00, two units. */
const paidOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 50, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    // Every `payment.succeeded` listener runs now, so the order needs the hold a real checkout made.
    await inventoryService.reserveForOrder(String(order._id), [
        { productId: String(product._id), quantity: 2 }
    ]);
    await payByCard(order, user);
    // Delivery is after the response: let the relay publish the settlement's rows before the
    // test moves the order on, as the paid order of a real shop has them delivered long before.
    await settleOutboxNudges();
    return { user, order, orderId: String(order._id) };
};

describe('a refund outside a return mails the buyer', () => {
    it('sends the refund notice to the buyer, naming a partial refund as part of the payment', async () => {
        const { order, orderId } = await paidOrder();

        await refundByOrder(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 });
        await waitForMails(() => mailsOf('payments.refund-issued').length > 0);

        expect(mailsOf('payments.refund-issued')[0][0].to).toBe(order.email);
        expect(dataOf('payments.refund-issued').body).toContain('30.00');
        expect(dataOf('payments.refund-issued').detail).toContain('part of what you paid');
    });

    it('says the refund is everything when the last part goes back', async () => {
        const { orderId } = await paidOrder();

        await refundByOrder(orderId, asAdmin(), callerContextAs('admin'), { amount: 100 });
        await waitForMails(() => mailsOf('payments.refund-issued').length > 0);

        expect(dataOf('payments.refund-issued').detail).toContain('everything');
    });

    it('judges "everything" from the refunds settled so far, so the last part says it and the first does not', async () => {
        const { orderId } = await paidOrder();

        await refundByOrder(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 });
        await waitForMails(() => mailsOf('payments.refund-issued').length === 1);
        await refundByOrder(orderId, asAdmin(), callerContextAs('admin'), { amount: 70 });
        await waitForMails(() => mailsOf('payments.refund-issued').length === 2);

        const [first, second] = mailsOf('payments.refund-issued').map((call) => call[2].detail);
        expect(first).toContain('part of what you paid');
        expect(second).toContain('everything');
    });

    it('follows a paid cancel: the cancelled notice first, then the refund when it lands', async () => {
        const { user, orderId } = await paidOrder();
        mockEnqueueEmail.mockClear();

        await orderService.cancelOnRequestById(orderId, asCustomer(user.id), {}, testCallerContext);
        await waitForMails(() => mailsOf('payments.refund-issued').length > 0);

        expect(mailsOf('orders.order-cancelled')).toHaveLength(1);
        expect(mailsOf('payments.refund-issued')).toHaveLength(1);
    });
});

describe('a refund that must not mail', () => {
    it("is silent for a return's refund — `returns` closes it with its own notice", async () => {
        const { orderId } = await paidOrder();

        await refundForReturn(
            orderId,
            { returnId: '64b64c4f4f4f4f4f4f4f4f4f', amount: 50, lines: [], shipping: 0 },
            testCallerContext
        );
        await settleOutboxNudges();

        expect(mailsOf('payments.refund-issued')).toHaveLength(0);
    });

    it('is silent when the provider refuses, since no money went back', async () => {
        const { orderId } = await paidOrder();
        jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('provider down'));

        await expect(
            refundByOrder(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 })
        ).rejects.toThrow('provider down');
        await settleOutboxNudges();

        expect(mailsOf('payments.refund-issued')).toHaveLength(0);
    });
});
