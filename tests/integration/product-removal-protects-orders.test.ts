/**
 * @module
 * A product removed or deactivated AFTER an order was placed counts as present for that order
 * (Q14 of the merge-alert plan: the order was placed while the product was on sale). `products`
 * announces either; `inventory` drops the level row on a hard delete only; `orders` and `payments`
 * do nothing: a pending order stays `pending`, nobody is emailed, and a card or offline payment
 * still goes through. Cross-module by nature (several modules' real `subscribe()` hooks), so it
 * lives here rather than in any one module's own `tests/`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext, asCustomer, callerContextAs } from '@tests/callers';
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
    it('drops the level row but leaves the order pending, with no email', async () => {
        const product = await createProduct({ onHand: 5 });
        const { orderId } = await placePendingOrder(product);

        const deleted = await readProduct(String(product._id));
        const result = await productService.remove(deleted!, true);

        expect(result.success).toBe(true);
        const order = await readOrder(orderId);
        expect(order!.status).toBe('pending');
        expect(mockEnqueueEmail).not.toHaveBeenCalled();

        // The level row is gone with the product — not left behind as a titleless orphan.
        await expect(stockLevelRepository.findByProductId(String(product._id))).resolves.toBeNull();
    });

    it('still lets the buyer pay by card: the order treats the product as present', async () => {
        const product = await createProduct({ onHand: 5 });
        const { orderId, user } = await placePendingOrder(product);
        const deleted = await readProduct(String(product._id));
        await productService.remove(deleted!, true);

        const result = await createIntent(orderId, asCustomer(user.id));

        expect(result.success).toBe(true);
    });

    it('still allows an offline payment on it', async () => {
        const product = await createProduct({ onHand: 5 });
        const { orderId } = await placePendingOrder(product);
        const deleted = await readProduct(String(product._id));
        await productService.remove(deleted!, true);

        const result = await recordOfflinePayment(
            orderId,
            { method: 'bank_transfer', reference: 'till-1' },
            callerContextAs('admin')
        );

        expect(result.success).toBe(true);
        const order = await readOrder(orderId);
        expect(order!.status).toBe('paid');
    });
});

describe('soft-deleting a product with a pending order against it', () => {
    it('leaves the order pending and payable by card, with no email', async () => {
        const product = await createProduct({ onHand: 5 });
        const { orderId, user } = await placePendingOrder(product);

        await productService.remove(product, false);

        const order = await readOrder(orderId);
        expect(order!.status).toBe('pending');
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
        const result = await createIntent(orderId, asCustomer(user.id));
        expect(result.success).toBe(true);
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

    it('still lets the buyer start a card payment', async () => {
        const product = await createProduct({ onHand: 5 });
        const { orderId, user } = await placePendingOrder(product);

        await productService.updateById(String(product._id), { active: false }, testCallerContext);

        const result = await createIntent(orderId, asCustomer(user.id));

        expect(result.success).toBe(true);
    });

    it('still allows an offline payment on it', async () => {
        const product = await createProduct({ onHand: 5 });
        const { orderId } = await placePendingOrder(product);

        await productService.updateById(String(product._id), { active: false }, testCallerContext);

        const result = await recordOfflinePayment(
            orderId,
            { method: 'bank_transfer', reference: 'till-1' },
            callerContextAs('admin')
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
