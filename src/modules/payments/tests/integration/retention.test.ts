/**
 * @module
 * Erasure detaches a payment from its account rather than deleting it — the
 * payment survives, same as the order it paid for. The cascade half (`personalData.erase` →
 * `detachUserId`) is proved through real module wiring, same as `cart`'s own cascade suite; the
 * offline-payment case below is the one live path that can still reach a detached order (an
 * operator recording money against it — a customer's intent never can, since no account owns it
 * any more), and pins that it records no garbage payer rather than the string `"undefined"`.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { detachOrderUserId } from '@modules/orders/tests/factories';
import {
    createIntent,
    confirmPayment,
    reapAbandonedPayments,
    recordOfflinePayment
} from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { paymentModel, type PaymentDocument } from '@modules/payments/model';
import { userService } from '@modules/users';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import type { ResponseSuccess } from '@infrastructure/http/response';
import type { Payment } from '@types';
import { asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import { setEnvironment } from '@tests/environment';

setupTestDb();

describe('payments — detach on account erasure', () => {
    beforeEach(() => {
        registerCheckoutModules([paymentsModule]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('unsets userId on the payment when the account is hard-deleted', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const payment = (intent as ResponseSuccess<Payment>).data;

        await userService.remove(user, true);

        const reloaded = await paymentRepository.findById(payment.id);
        expect(reloaded!.userId).toBeUndefined();
    });

    it('the payment itself survives — it is the receipt, not the account', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const payment = (intent as ResponseSuccess<Payment>).data;

        await userService.remove(user, true);

        await expect(paymentRepository.findById(payment.id)).resolves.not.toBeNull();
    });

    it('an offline payment against an already-detached order records no payer, not the string "undefined"', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await detachOrderUserId(String(user._id), new Date(Date.now() + 100_000));

        const recorded = await recordOfflinePayment(
            String(order._id),
            { method: 'cash' },
            callerContextAs('admin')
        );

        const payment = (recorded as ResponseSuccess<PaymentDocument>).data;
        expect(payment.userId).toBeUndefined();
    });

    it('no customer can open an intent on an order whose account is gone', async () => {
        const user = await createUser();
        const stranger = await createUser({ email: 'stranger@example.com', username: 'stranger' });
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await detachOrderUserId(String(user._id), new Date(Date.now() + 100_000));

        const intent = await createIntent(String(order._id), asCustomer(String(stranger._id)));

        expect(intent.success).toBe(false);
    });
});

/** Backdates a payment's `updatedAt` without disturbing anything else — `timestamps: false` is
 *  what keeps Mongoose from immediately overwriting it back to "now". */
const touch = (paymentId: string, updatedAt: Date): Promise<unknown> =>
    paymentModel
        .updateOne({ _id: paymentId }, { $set: { updatedAt } }, { timestamps: false })
        .exec();

describe('payments — reapAbandonedPayments (reap-payments sweep)', () => {
    beforeEach(() => {
        registerCheckoutModules([paymentsModule]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('deletes an attempt that never settled, once it is past the window', async () => {
        setEnvironment({ NODE_PAYMENT_ABANDONED_RETENTION_DAYS: '7' });
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const payment = (intent as ResponseSuccess<Payment>).data;
        await touch(payment.id, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));

        await expect(reapAbandonedPayments()).resolves.toBe(1);

        await expect(paymentRepository.findById(payment.id)).resolves.toBeNull();
    });

    it('leaves an attempt alone while it is still within the window', async () => {
        setEnvironment({ NODE_PAYMENT_ABANDONED_RETENTION_DAYS: '7' });
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const payment = (intent as ResponseSuccess<Payment>).data;
        await touch(payment.id, new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));

        await expect(reapAbandonedPayments()).resolves.toBe(0);

        await expect(paymentRepository.findById(payment.id)).resolves.not.toBeNull();
    });

    it('never deletes a payment that succeeded, no matter how old', async () => {
        setEnvironment({ NODE_PAYMENT_ABANDONED_RETENTION_DAYS: '7' });
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const paymentId = (intent as ResponseSuccess<Payment>).data.id;
        await confirmPayment(paymentId, 'pm_card_visa', asCustomer(user.id), testCallerContext);
        await touch(paymentId, new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));

        await expect(reapAbandonedPayments()).resolves.toBe(0);

        await expect(paymentRepository.findById(paymentId)).resolves.not.toBeNull();
    });
});
