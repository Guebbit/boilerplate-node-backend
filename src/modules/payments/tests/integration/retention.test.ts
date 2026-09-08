/**
 * @module
 * Erasure detaches a payment from its account rather than deleting it — the
 * payment survives, same as the order it paid for. The cascade half (`USER_DELETED` →
 * `detachUserId`) is proved through real module wiring, same as `cart`'s own cascade suite; the
 * `createIntent` case below is the one live path that can still reach a detached order (an admin
 * intent against it), and pins that it records no garbage payer rather than the string
 * `"undefined"`.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/fixtures';
import { createProduct } from '@modules/products/tests/fixtures';
import { createOrder, toOrderItem } from '@modules/orders/tests/fixtures';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { orderRepository } from '@modules/orders';
import { createIntent, confirmPayment, reapAbandonedPayments } from '@modules/payments/service';
import { paymentRepository } from '@modules/payments/repository';
import { paymentModel } from '@modules/payments/model';
import { userService } from '@modules/users';
import { testCallerContext } from '@tests/caller-context';
import paymentsModule from '@modules/payments/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import productsModule from '@modules/products/module';
import usersModule from '@modules/users/module';
import accountModule from '@modules/account/module';
import cartModule from '@modules/cart/module';
import deliveryModule from '@modules/delivery/module';
import type { ResponseSuccess } from '@infrastructure/http/response';
import type { Payment } from '@types';
import { asCustomer, asOwner } from '../../../../../tests/support/callers';

setupTestDb();

describe('payments — detach on account erasure', () => {
    beforeEach(() => {
        registerModules([
            accountModule,
            deliveryModule,
            productsModule,
            usersModule,
            inventoryModule,
            ordersModule,
            paymentsModule,
            cartModule
        ]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('unsets userId on the payment when the account is hard-deleted', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const payment = (intent as ResponseSuccess<Payment>).data!;

        await userService.remove(user, true);

        const reloaded = await paymentRepository.findById(payment.id);
        expect(reloaded!.userId).toBeUndefined();
    });

    it('the payment itself survives — it is the receipt, not the account', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const payment = (intent as ResponseSuccess<Payment>).data!;

        await userService.remove(user, true);

        await expect(paymentRepository.findById(payment.id)).resolves.not.toBeNull();
    });

    it('an admin intent against an already-detached order records no payer, not the string "undefined"', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await orderRepository.detachUserId(String(user._id), new Date(Date.now() + 100_000));

        const intent = await createIntent(String(order._id), asOwner('admin-caller'));

        const payment = (intent as ResponseSuccess<Payment>).data!;
        expect(payment.userId).toBeUndefined();
    });
});

/** Backdates a payment's `updatedAt` without disturbing anything else — `timestamps: false` is
 *  what keeps Mongoose from immediately overwriting it back to "now". */
const touch = (paymentId: string, updatedAt: Date): Promise<unknown> =>
    paymentModel
        .updateOne({ _id: paymentId }, { $set: { updatedAt } }, { timestamps: false })
        .exec();

describe('payments — reapAbandonedPayments (reap-payments sweep)', () => {
    const originalRetention = process.env.NODE_PAYMENT_ABANDONED_RETENTION_DAYS;

    beforeEach(() => {
        registerModules([
            accountModule,
            deliveryModule,
            productsModule,
            usersModule,
            inventoryModule,
            ordersModule,
            paymentsModule,
            cartModule
        ]);
    });

    afterEach(() => {
        resetDomainEvents();
        if (originalRetention === undefined)
            delete process.env.NODE_PAYMENT_ABANDONED_RETENTION_DAYS;
        else process.env.NODE_PAYMENT_ABANDONED_RETENTION_DAYS = originalRetention;
    });

    it('deletes an attempt that never settled, once it is past the window', async () => {
        process.env.NODE_PAYMENT_ABANDONED_RETENTION_DAYS = '7';
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const payment = (intent as ResponseSuccess<Payment>).data!;
        await touch(payment.id, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));

        await expect(reapAbandonedPayments()).resolves.toBe(1);

        await expect(paymentRepository.findById(payment.id)).resolves.toBeNull();
    });

    it('leaves an attempt alone while it is still within the window', async () => {
        process.env.NODE_PAYMENT_ABANDONED_RETENTION_DAYS = '7';
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const payment = (intent as ResponseSuccess<Payment>).data!;
        await touch(payment.id, new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));

        await expect(reapAbandonedPayments()).resolves.toBe(0);

        await expect(paymentRepository.findById(payment.id)).resolves.not.toBeNull();
    });

    it('never deletes a payment that succeeded, no matter how old', async () => {
        process.env.NODE_PAYMENT_ABANDONED_RETENTION_DAYS = '7';
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const paymentId = (intent as ResponseSuccess<Payment>).data!.id;
        await confirmPayment(paymentId, 'pm_card_visa', asCustomer(user.id), testCallerContext);
        await touch(paymentId, new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));

        await expect(reapAbandonedPayments()).resolves.toBe(0);

        await expect(paymentRepository.findById(paymentId)).resolves.not.toBeNull();
    });
});
