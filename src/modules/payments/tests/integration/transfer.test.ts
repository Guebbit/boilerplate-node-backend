/**
 * @module
 * The payment of a bank transfer, from the moment its order is placed: `order.created` opens a
 * `requires_action` row carrying the RF reference and the deadline, the instructions ride on it
 * (`nextAction`) and in one mail, the money is recorded onto the same row, a lapsed deadline or a
 * cancel closes it, and a transfer that lands late is still matched by its reference and owed
 * straight back. Real Mongo; the mailer is the only thing replaced.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, readOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { orderService } from '@modules/orders';
import {
    createIntent,
    getForOrder,
    getOrderByReference,
    openTransferPayment,
    reapAbandonedPayments,
    reconcileStalePayments,
    recordOfflinePayment,
    syncPayment
} from '@modules/payments/services';
import { paymentModel } from '@modules/payments/model';
import { paymentRepository } from '@modules/payments/repository';
import { presentPayment } from '@modules/payments/presenter';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import { asReject, asSuccess } from '@tests/response';
import { OrderStatus } from '@types';
import { transferOrder } from '../factories';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
    mockEnqueueEmail.mockClear();
});

afterEach(() => {
    resetDomainEvents();
});

/** The templates of every mail queued so far, in order. */
const templatesSent = () => mockEnqueueEmail.mock.calls.map(([, template]) => template);

/** The payment of an order, read back. */
const paymentOf = (orderId: string) => paymentRepository.findByOrderId(orderId);

/** The status of an order's payment, read back. */
const paymentStatusOf = (orderId: string) => paymentOf(orderId).then((payment) => payment?.status);

/** The status of an order, read back. */
const orderStatusOf = (orderId: string) => readOrder(orderId).then((order) => order?.status);

/** An order cancelled because its hold ran out, the way the reservation sweep cancels it. */
const lapse = async (orderId: string) => {
    await orderService.expireReservationById(orderId);
    await settleOutboxNudges();
};

describe('opening the transfer payment', () => {
    it('opens a waiting, hand-recorded payment for the order total, with the reference and the deadline', async () => {
        const { order, payment, reference } = await transferOrder({ price: 20 });

        expect(payment).toMatchObject({
            status: 'requires_action',
            method: 'bank_transfer',
            provider: 'manual',
            amount: 20,
            currency: order.currency,
            transferReference: reference
        });
        expect(payment.payBy?.getTime()).toBe(order.payBy?.getTime());
        expect(payment.providerRef).toBeUndefined();
    });

    it('mails the instructions once, however often the event is delivered', async () => {
        const { order } = await transferOrder();

        await openTransferPayment(String(order._id));
        await openTransferPayment(String(order._id));

        expect(templatesSent()).toEqual(['payments.transfer-instructions']);
        expect(await paymentModel.countDocuments({ orderId: order._id })).toBe(1);
    });

    it.each<[string, Parameters<typeof createOrder>[2]]>([
        ['a card order', { paymentMethod: 'card' }],
        ['an order raised without a payment method', {}],
        [
            'an order that is not payable any more',
            { paymentMethod: 'bank_transfer', status: OrderStatus.paid }
        ]
    ])('opens nothing for %s', async (_label, extras) => {
        const user = await createUser();
        const order = await createOrder(user, [toOrderItem(await createProduct(), 1)], {
            payBy: new Date(Date.now() + 3_600_000).toISOString(),
            ...extras
        });

        await openTransferPayment(String(order._id));

        expect(await paymentOf(String(order._id))).toBeNull();
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('leaves a payment that already exists exactly as it is, and mails nothing', async () => {
        const user = await createUser();
        const order = await createOrder(user, [toOrderItem(await createProduct(), 1)], {
            paymentMethod: 'bank_transfer',
            payBy: new Date(Date.now() + 3_600_000).toISOString()
        });
        await createIntent(String(order._id), asCustomer(user.id));
        mockEnqueueEmail.mockClear();

        await openTransferPayment(String(order._id));

        expect(await paymentOf(String(order._id))).toMatchObject({
            method: 'card',
            status: 'requires_confirmation'
        });
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});

describe('the instructions on the payment', () => {
    it('show where to send the money, under the payment’s own reference and deadline', async () => {
        const { payment, reference } = await transferOrder();

        const { nextAction } = presentPayment(payment);

        expect(nextAction).toEqual({
            type: 'bank_transfer',
            beneficiary: 'Guebbit Demo Shop',
            // Grouped into blocks of four, the way a bank's own form shows an IBAN.
            iban: 'IT60 X054 2811 1010 0000 0123 456',
            reference,
            payBy: payment.payBy?.toISOString()
        });
    });

    it('add the BIC only when the deployment configured one', () =>
        withEnvironment('NODE_BANK_TRANSFER_BIC', 'COBADEFFXXX', async () => {
            const { payment } = await transferOrder();

            expect(presentPayment(payment).nextAction).toMatchObject({ bic: 'COBADEFFXXX' });
        }));

    it('go away once the buyer switches to a card, but the reference stays for a transfer sent meanwhile', async () => {
        const user = await createUser();
        const { order, reference } = await transferOrder({ user });

        const intent = await createIntent(String(order._id), asCustomer(user.id));

        expect(intent.success).toBe(true);
        const switched = await paymentOf(String(order._id));
        expect(switched).toMatchObject({
            method: 'card',
            status: 'requires_confirmation',
            transferReference: reference
        });
        expect(presentPayment(switched!).nextAction).toBeUndefined();
    });

    it('say nothing when the deployment no longer offers transfers', () =>
        withEnvironment('NODE_BANK_TRANSFER_BENEFICIARY', '', async () => {
            const { payment } = await transferOrder();

            expect(presentPayment(payment).nextAction).toBeUndefined();
        }));
});

describe('what the buyer may still do', () => {
    it('offers the card form beside the instructions: an open transfer is payable', async () => {
        const user = await createUser();
        const { order } = await transferOrder({ user });

        const read = await getForOrder(String(order._id), asCustomer(user.id));

        expect(asSuccess(read).data.actions?.pay).toBe(true);
    });
});

describe('recording the money', () => {
    it('settles the very payment the order opened: the order is paid and nothing new is created', async () => {
        const { order, payment } = await transferOrder();

        const recorded = await recordOfflinePayment(
            String(order._id),
            { method: 'bank_transfer', reference: 'statement line 42' },
            callerContextAs('admin')
        );

        expect(recorded.success).toBe(true);
        // 200, not 201: the row existed and was converted.
        expect(recorded.status).toBe(200);
        expect(String(asSuccess(recorded).data._id)).toBe(String(payment._id));
        expect(await paymentOf(String(order._id))).toMatchObject({
            status: 'succeeded',
            reference: 'statement line 42'
        });
        expect(await orderStatusOf(String(order._id))).toBe('paid');
    });
});

describe('a transfer nobody sent', () => {
    it('closes the payment and tells the buyer no transfer arrived — once', async () => {
        const { order } = await transferOrder();
        mockEnqueueEmail.mockClear();

        await lapse(String(order._id));

        expect(await paymentStatusOf(String(order._id))).toBe('cancelled');
        // `orders` stays quiet for a transfer: the deadline is the payment's, so is the notice.
        expect(templatesSent()).toEqual(['payments.transfer-expired']);
    });

    it('does not call the buyer’s own cancel an expiry', async () => {
        const user = await createUser();
        const { order } = await transferOrder({ user });
        mockEnqueueEmail.mockClear();

        await orderService.cancelOnRequestById(
            String(order._id),
            asCustomer(user.id),
            {},
            testCallerContext
        );
        await settleOutboxNudges();

        expect(await paymentStatusOf(String(order._id))).toBe('cancelled');
        expect(templatesSent()).toEqual(['orders.order-cancelled']);
    });
});

describe('a transfer that lands after its order was cancelled', () => {
    it('is still matched by its reference, recorded onto the closed payment, and owed straight back', async () => {
        const { order, reference } = await transferOrder({ price: 20 });
        await lapse(String(order._id));

        const found = await getOrderByReference(reference);
        const recorded = await recordOfflinePayment(
            String(order._id),
            { method: 'bank_transfer', reference: 'late statement line' },
            callerContextAs('admin')
        );

        expect(String(asSuccess(found).data._id)).toBe(String(order._id));
        // The money is real: it is recorded, not refused, and the answer is the payment itself.
        expect(recorded.success).toBe(true);
        const payment = await paymentOf(String(order._id));
        expect(payment).toMatchObject({ status: 'succeeded', amountRefunded: 20 });
        // A hand-paid refund is returned by an operator off-system: the record stays open.
        expect(payment?.refunds).toHaveLength(1);
        expect(payment?.refunds[0].status).not.toBe('succeeded');
        // The order is not revived and nothing was committed to a shelf.
        expect(await orderStatusOf(String(order._id))).toBe('cancelled');
    });

    it('is refused when the order was cancelled but no transfer payment was ever opened for it', async () => {
        const user = await createUser();
        const order = await createOrder(user, [toOrderItem(await createProduct(), 1)], {
            status: OrderStatus.cancelled
        });

        const recorded = await recordOfflinePayment(
            String(order._id),
            { method: 'bank_transfer' },
            callerContextAs('admin')
        );

        expect(asReject(recorded).status).toBe(409);
    });
});

describe('how long the transfer payment is kept', () => {
    const DAY = 86_400_000;

    /** Backdates a payment's last touch without moving `updatedAt` back to now. */
    const touchedDaysAgo = (orderId: string, days: number) =>
        paymentModel
            .updateOne(
                { orderId },
                { $set: { updatedAt: new Date(Date.now() - days * DAY) } },
                { timestamps: false }
            )
            .exec();

    it('outlasts the ordinary abandoned attempt, so a late transfer can still be matched', async () => {
        const closed = await transferOrder();
        await lapse(String(closed.order._id));
        const user = await createUser({ email: 'card-buyer@example.com' });
        const card = await createOrder(user, [toOrderItem(await createProduct(), 1)]);
        await createIntent(String(card._id), asCustomer(user.id));
        await orderService.cancelOnRequestById(
            String(card._id),
            asCustomer(user.id),
            {},
            testCallerContext
        );
        await settleOutboxNudges();
        await touchedDaysAgo(String(closed.order._id), 60);
        await touchedDaysAgo(String(card._id), 60);

        await reapAbandonedPayments();

        expect(await paymentOf(String(closed.order._id))).not.toBeNull();
        expect(await paymentOf(String(card._id))).toBeNull();
    });

    it('goes after a year', async () => {
        const { order } = await transferOrder();
        await lapse(String(order._id));
        await touchedDaysAgo(String(order._id), 400);

        await reapAbandonedPayments();

        expect(await paymentOf(String(order._id))).toBeNull();
    });
});

describe('what has nothing to ask a provider', () => {
    it('is left alone by the reconcile sweep and by the browser’s sync', () =>
        withEnvironment('NODE_PAYMENT_RECONCILE_MINUTES', '0', async () => {
            const user = await createUser();
            const { order, payment } = await transferOrder({ user });

            const swept = await reconcileStalePayments();
            const synced = await syncPayment(
                String(payment._id),
                asCustomer(user.id),
                testCallerContext
            );

            expect(swept).toBe(0);
            expect(synced.success).toBe(true);
            expect(await paymentStatusOf(String(order._id))).toBe('requires_action');
        }));
});
