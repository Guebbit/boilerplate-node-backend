/**
 * @module
 * Money going back is never silent: a refund that settles OUTSIDE a return mails the buyer
 * `orders.order-refunded`. A return's refund is announced by `returns`' own closing notice, and a
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
import { resetDomainEvents } from '@kernel/events';
import {
    createIntent,
    confirmPayment,
    refundByOrder,
    refundForReturn
} from '@modules/payments/services';
import { fakePaymentProvider } from '@modules/payments/providers/fake';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, asAdmin, testCallerContext } from '@tests/callers';

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
 * Waits for `predicate` to turn true, polling.
 * @throws {Error} if `predicate` never turns true within `timeoutMs`
 */
const waitUntil = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) throw new Error('waitUntil: timed out');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

/** Gives any straggler mail every chance to show up before an absence is asserted. */
const settleQuietly = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 150));

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
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    const intent = await createIntent(String(order._id), asCustomer(user.id));
    await confirmPayment(
        String((intent as { data?: { id?: string } }).data?.id),
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
    return { user, order, orderId: String(order._id) };
};

describe('a refund outside a return mails the buyer', () => {
    it('sends the refund notice to the buyer, naming a partial refund as part of the payment', async () => {
        const { order, orderId } = await paidOrder();

        await refundByOrder(orderId, asAdmin(), testCallerContext, { amount: 30 });
        await waitUntil(() => mailsOf('orders.order-refunded').length > 0);

        expect(mailsOf('orders.order-refunded')[0][0].to).toBe(order.email);
        expect(dataOf('orders.order-refunded').body).toContain('30.00');
        expect(dataOf('orders.order-refunded').detail).toContain('part of what you paid');
    });

    it('says the refund is everything when the last part goes back', async () => {
        const { orderId } = await paidOrder();

        await refundByOrder(orderId, asAdmin(), testCallerContext, { amount: 100 });
        await waitUntil(() => mailsOf('orders.order-refunded').length > 0);

        expect(dataOf('orders.order-refunded').detail).toContain('everything');
    });

    it('follows a paid cancel: the cancelled notice first, then the refund when it lands', async () => {
        const { user, orderId } = await paidOrder();
        mockEnqueueEmail.mockClear();

        await orderService.cancelById(orderId, asCustomer(user.id), {}, testCallerContext);
        await waitUntil(() => mailsOf('orders.order-refunded').length > 0);

        expect(mailsOf('orders.order-cancelled')).toHaveLength(1);
        expect(mailsOf('orders.order-refunded')).toHaveLength(1);
    });
});

describe('a refund that must not mail', () => {
    it("is silent for a return's refund — `returns` closes it with its own notice", async () => {
        const { orderId } = await paidOrder();

        await refundForReturn(
            orderId,
            { returnId: '64b64c4f4f4f4f4f4f4f4f4f', amount: 50 },
            testCallerContext
        );
        await settleQuietly();

        expect(mailsOf('orders.order-refunded')).toHaveLength(0);
    });

    it('is silent when the provider refuses, since no money went back', async () => {
        const { orderId } = await paidOrder();
        jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('provider down'));

        await expect(
            refundByOrder(orderId, asAdmin(), testCallerContext, { amount: 30 })
        ).rejects.toThrow('provider down');
        await settleQuietly();

        expect(mailsOf('orders.order-refunded')).toHaveLength(0);
    });
});
