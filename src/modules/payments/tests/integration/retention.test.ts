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
import { createIntent } from '@modules/payments/service';
import { paymentRepository } from '@modules/payments/repository';
import { userService } from '@modules/users';
import paymentsModule from '@modules/payments/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import productsModule from '@modules/products/module';
import usersModule from '@modules/users/module';
import accountModule from '@modules/account/module';
import cartModule from '@modules/cart/module';
import deliveryModule from '@modules/delivery/module';
import type { ResponseSuccess } from '@infrastructure/http/response';
import type { PaymentDocument } from '@modules/payments/model';

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
        const intent = await createIntent(String(order._id), { admin: false, id: user.id });
        const payment = (intent as ResponseSuccess<PaymentDocument>).data!;

        await userService.remove(user, true);

        const reloaded = await paymentRepository.findById(String(payment._id));
        expect(reloaded!.userId).toBeUndefined();
    });

    it('the payment itself survives — it is the receipt, not the account', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const intent = await createIntent(String(order._id), { admin: false, id: user.id });
        const payment = (intent as ResponseSuccess<PaymentDocument>).data!;

        await userService.remove(user, true);

        await expect(paymentRepository.findById(String(payment._id))).resolves.not.toBeNull();
    });

    it('an admin intent against an already-detached order records no payer, not the string "undefined"', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await orderRepository.detachUserId(String(user._id), new Date(Date.now() + 100_000));

        const intent = await createIntent(String(order._id), { admin: true, id: 'admin-caller' });

        const payment = (intent as ResponseSuccess<PaymentDocument>).data!;
        expect(payment.userId).toBeUndefined();
    });
});
