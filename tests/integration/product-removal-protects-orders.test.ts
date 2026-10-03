/**
 * @module
 * A removed or deactivated product must not be sold NEW, but the two differ on an order already
 * placed: `products` announces either, `inventory` drops the level row (hard delete only),
 * `orders` cancels every pending order still holding it ONLY on a hard delete and emails the
 * buyer — a deactivation leaves a pending order exactly as it was. Either way a NEW card payment
 * attempt racing the change is refused by name, while an offline one still succeeds. Cross-module
 * by nature (several modules' real `subscribe()` hooks), so it lives here rather than in any one
 * module's own `tests/`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext, asCustomer } from '@tests/callers';
import { resetDomainEvents } from '@kernel/events';
import { enqueueEmail } from '@infrastructure/adapters/mailer';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

/** Waits out `sendOrderPlacedEmail`'s own fire-and-forget chain, so its `enqueueEmail` call has
 * already landed before a case clears or asserts on the mock. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';

import { giveAddress } from '@modules/addresses/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, readProduct, productRepository } from '@modules/products/tests/factories';
import { productService } from '@modules/products';
import { cartItemSetById, orderConfirm } from '@modules/cart/services';
import { cartRepository } from '@modules/cart/repository';
import { readOrder } from '@modules/orders/tests/factories';
import { createIntent } from '@modules/payments/services/intent';
import { recordOfflinePayment } from '@modules/payments/services/offline';
import { stockLevelRepository } from '@modules/inventory/repository';
import type { ResponseReject } from '@infrastructure/http/response';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
    mockEnqueueEmail.mockClear();
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A pending order for one unit of `product`, through the real checkout flow. */
const placePendingOrder = async (product: Awaited<ReturnType<typeof createProduct>>) => {
    const user = await createUser();
    await giveAddress(user.id);
    await cartItemSetById(user.id, String(product._id), 1);
    await cartRepository.setShippingMethod(user.id, 'pickup');
    const result = await orderConfirm(user.id, testCallerContext, undefined);
    if (!result.success) throw new Error('setup: checkout was refused');
    // The confirmation email already fired at placement — every assertion below cares only
    // about what happens AFTER the product stops being sellable. `flush()` first, so that
    // fire-and-forget dispatch has actually landed on the mock before this clears it.
    await flush();
    mockEnqueueEmail.mockClear();
    return { user, orderId: String(result.data._id) };
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
    it('leaves the order pending and holding its stock — no cancellation, no email', async () => {
        const product = await createProduct({ onHand: 5 });
        const { orderId } = await placePendingOrder(product);

        await productService.updateById(String(product._id), { active: false }, testCallerContext);

        const order = await readOrder(orderId);
        expect(order!.status).toBe('pending');
        expect(mockEnqueueEmail).not.toHaveBeenCalled();

        // The hold is still there to release on a later cancel or a successful payment.
        await expect(
            stockLevelRepository.findByProductId(String(product._id))
        ).resolves.not.toBeNull();
    });

    it('still refuses a NEW card payment attempt with 409 ORDER_PRODUCT_UNAVAILABLE', async () => {
        const product = await createProduct({ onHand: 5 });
        const { orderId, user } = await placePendingOrder(product);

        await productService.updateById(String(product._id), { active: false }, testCallerContext);

        const result = await createIntent(orderId, asCustomer(user.id));

        expect(result.success).toBe(false);
        const rejected = result as ResponseReject;
        expect(rejected.status).toBe(409);
        expect(rejected.errors[0].code).toBe('ORDER_PRODUCT_UNAVAILABLE');
    });

    it('still allows an offline payment on it, since a human confirmed the money already moved', async () => {
        const product = await createProduct({ onHand: 5 });
        const { orderId } = await placePendingOrder(product);

        await productService.updateById(String(product._id), { active: false }, testCallerContext);

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
        await giveAddress(user.id);
        await cartItemSetById(user.id, String(product._id), 1);
        await cartRepository.setShippingMethod(user.id, 'pickup');
        const checkout = await orderConfirm(user.id, testCallerContext, undefined);
        if (!checkout.success) throw new Error('setup: checkout was refused');
        const orderId = String(checkout.data._id);

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
        await giveAddress(user.id);
        await cartItemSetById(user.id, String(product._id), 1);
        await cartRepository.setShippingMethod(user.id, 'pickup');
        const checkout = await orderConfirm(user.id, testCallerContext, undefined);
        if (!checkout.success) throw new Error('setup: checkout was refused');
        const orderId = String(checkout.data._id);

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

describe('a write that fails must not have already announced the deletion', () => {
    it('a hard delete whose write fails leaves the cart line — the event never fired', async () => {
        const product = await createProduct({ onHand: 5 });
        const user = await createUser();
        await cartItemSetById(user.id, String(product._id), 1);

        jest.spyOn(productRepository, 'deleteOne').mockRejectedValueOnce(
            new Error('mongo is down')
        );

        await expect(productService.remove(product, true)).rejects.toThrow('mongo is down');

        // `cart`'s own `PRODUCT_DELETED` listener drops the line unconditionally — it never ran,
        // because the event is only emitted AFTER `deleteOne` succeeds, and this `deleteOne` didn't.
        const cart = await cartRepository.findByUserId(user.id);
        expect(cart!.items.some((item) => item.productId.toString() === String(product._id))).toBe(
            true
        );
        // The row itself never left the database either — same write, same failure.
        await expect(readProduct(String(product._id))).resolves.not.toBeNull();
    });

    it('a soft delete whose write fails leaves the cart line — the event never fired', async () => {
        const product = await createProduct({ onHand: 5 });
        const user = await createUser();
        await cartItemSetById(user.id, String(product._id), 1);

        jest.spyOn(productRepository, 'save').mockRejectedValueOnce(new Error('mongo is down'));

        await expect(productService.remove(product, false)).rejects.toThrow('mongo is down');

        const cart = await cartRepository.findByUserId(user.id);
        expect(cart!.items.some((item) => item.productId.toString() === String(product._id))).toBe(
            true
        );
        const reloaded = await readProduct(String(product._id));
        expect(reloaded!.deletedAt).toBeUndefined();
    });
});
