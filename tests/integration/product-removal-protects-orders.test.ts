/**
 * @module
 * A removed or deactivated product must not be sold, but removing it must still work — the
 * cross-module cascade: `products` announces it, `inventory` drops the level row (hard delete
 * only), `orders` cancels every pending order still holding it and emails the buyer, and a
 * payment attempt racing the event is refused by name. Cross-module by nature (four modules'
 * real `subscribe()` hooks), so it lives here rather than in any one module's own `tests/`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { asCustomer } from '@tests/callers';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { enqueueEmail } from '@infrastructure/adapters/mailer';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

import productsModule from '@modules/products/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import paymentsModule from '@modules/payments/module';
import cartModule from '@modules/cart/module';
import deliveryModule from '@modules/delivery/module';
import accountModule from '@modules/account/module';
import usersModule from '@modules/users/module';

import { createUser } from '@modules/users/tests/factories';
import { createProduct, readProduct } from '@modules/products/tests/factories';
import { productService } from '@modules/products';
import { cartItemSetById, orderConfirm } from '@modules/cart/services';
import { readOrder } from '@modules/orders/tests/factories';
import { createIntent } from '@modules/payments/services/intent';
import { recordOfflinePayment } from '@modules/payments/services/offline';
import { stockLevelRepository } from '@modules/inventory/repository';
import type { ResponseReject } from '@infrastructure/http/response';

setupTestDb();

beforeEach(() => {
    registerModules([
        accountModule,
        usersModule,
        deliveryModule,
        productsModule,
        inventoryModule,
        ordersModule,
        paymentsModule,
        cartModule
    ]);
    mockEnqueueEmail.mockClear();
});

afterEach(() => resetDomainEvents());

/** A pending order for one unit of `product`, through the real checkout flow. */
const placePendingOrder = async (product: Awaited<ReturnType<typeof createProduct>>) => {
    const user = await createUser();
    await cartItemSetById(user.id, String(product._id), 1);
    const result = await orderConfirm(user.id, testCallerContext);
    if (!result.success) throw new Error('setup: checkout was refused');
    // The confirmation email already fired at placement — every assertion below cares only
    // about what happens AFTER the product stops being sellable.
    mockEnqueueEmail.mockClear();
    return { user, orderId: String(result.data!._id) };
};

describe('hard-deleting a product with a pending order against it', () => {
    it('deletes the product, cancels the order, emails the buyer, and drops the level row', async () => {
        const product = await createProduct({ onHand: 5 });
        const { orderId } = await placePendingOrder(product);

        const deleted = await readProduct(String(product._id));
        const result = await productService.remove(deleted!, true);

        expect(result.success).toBe(true);

        const order = await readOrder(orderId);
        expect(order!.status).toBe('cancelled');

        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [, template] = mockEnqueueEmail.mock.calls[0];
        expect(template).toBe('orders.order-product-unavailable');

        // The level row is gone with the product — not left behind as a titleless orphan.
        await expect(stockLevelRepository.findByProductId(String(product._id))).resolves.toBeNull();
    });
});

describe('deactivating a product with a pending order against it', () => {
    it('cancels the order and emails the buyer, but keeps the level row', async () => {
        const product = await createProduct({ onHand: 5 });
        const { orderId } = await placePendingOrder(product);

        const toDeactivate = await readProduct(String(product._id));
        await productService.updateById(String(product._id), { active: false }, testCallerContext);
        void toDeactivate; // the id is enough; the fresh read above already confirmed it exists

        const order = await readOrder(orderId);
        expect(order!.status).toBe('cancelled');
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);

        // Deactivation may be reversed — the counters must still be there to reverse it onto.
        await expect(
            stockLevelRepository.findByProductId(String(product._id))
        ).resolves.not.toBeNull();
    });
});

describe('a soft delete or a restore', () => {
    it('leaves the level row alone — only a hard delete removes it', async () => {
        const product = await createProduct({ onHand: 5 });

        await productService.remove(product, false); // soft delete
        await expect(
            stockLevelRepository.findByProductId(String(product._id))
        ).resolves.not.toBeNull();

        const softDeleted = await readProduct(String(product._id));
        await productService.remove(softDeleted!, false); // restore
        await expect(
            stockLevelRepository.findByProductId(String(product._id))
        ).resolves.not.toBeNull();
    });
});

describe('a payment attempt racing the removal event', () => {
    it('is refused with 409 ORDER_PRODUCT_UNAVAILABLE, naming the product', async () => {
        const product = await createProduct({ onHand: 5 });
        const user = await createUser();
        await cartItemSetById(user.id, String(product._id), 1);
        const checkout = await orderConfirm(user.id, testCallerContext);
        if (!checkout.success) throw new Error('setup: checkout was refused');
        const orderId = String(checkout.data!._id);

        // The product vanishes WITHOUT going through the listener that would have cancelled the
        // order — the exact gap `createIntent`'s own check is the backstop for.
        await stockLevelRepository.deleteByProductId(String(product._id));
        const raw = await readProduct(String(product._id));
        raw!.deletedAt = new Date();
        await raw!.save();

        const result = await createIntent(orderId, asCustomer(user.id));

        expect(result.success).toBe(false);
        const rejected = result as ResponseReject;
        expect(rejected.status).toBe(409);
        expect(rejected.errors[0].code).toBe('ORDER_PRODUCT_UNAVAILABLE');
        expect(rejected.errors[0].details).toMatchObject({
            lines: [{ productId: String(product._id), title: product.title }]
        });
    });
});

describe('admin offline recording on an order whose product is gone', () => {
    it('still succeeds — the money already moved', async () => {
        const product = await createProduct({ onHand: 5 });
        const user = await createUser();
        await cartItemSetById(user.id, String(product._id), 1);
        const checkout = await orderConfirm(user.id, testCallerContext);
        if (!checkout.success) throw new Error('setup: checkout was refused');
        const orderId = String(checkout.data!._id);

        await stockLevelRepository.deleteByProductId(String(product._id));
        const raw = await readProduct(String(product._id));
        raw!.deletedAt = new Date();
        await raw!.save();

        const result = await recordOfflinePayment(
            orderId,
            { method: 'bank_transfer', reference: 'till-1' },
            testCallerContext
        );

        expect(result.success).toBe(true);
        const order = await readOrder(orderId);
        expect(order!.status).toBe('paid');
    });
});
