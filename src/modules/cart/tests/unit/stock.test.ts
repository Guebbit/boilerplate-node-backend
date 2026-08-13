/**
 * Stock across the checkout — the invariant is "stock moved if and only if the order stands".
 *
 * The domain verdict (`domain-rules.test.ts`) is the pre-flight half; these cases drive the
 * repository's conditional decrement through the real service against a real database, because
 * the property that matters — a refused checkout leaves the shelf exactly as it found it — is a
 * property of the WRITES, not of the verdict.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factory';
import { createProduct } from '@modules/products/tests/factory';
import { cartService } from '@modules/cart';
import { productRepository } from '@modules/products';
import { orderService, orderRepository } from '@modules/orders';

setupTestDb();

const shelfCount = async (productId: unknown): Promise<number | undefined> => {
    const stored = await productRepository.findById(String(productId));
    return stored?.stock;
};

describe('checkout and stock', () => {
    it('a completed checkout takes exactly the ordered units', async () => {
        const user = await createUser();
        const product = await createProduct({ stock: 10 });
        await cartService.cartItemAddById(user.id, String(product._id), 3);

        const result = await cartService.orderConfirm(user.id);

        expect(result.success).toBe(true);
        expect(await shelfCount(product._id)).toBe(7);
    });

    it('refuses a cart over the shelf and moves nothing', async () => {
        const user = await createUser();
        const product = await createProduct({ stock: 2 });
        await cartService.cartItemAddById(user.id, String(product._id), 3);

        const result = await cartService.orderConfirm(user.id);

        expect(result.success).toBe(false);
        expect(result.status).toBe(409);
        expect(result.success === false && result.errors[0]).toMatchObject({
            code: 'CART_INSUFFICIENT_STOCK'
        });
        expect(await shelfCount(product._id)).toBe(2);
        // And the cart survives — a refused checkout is not a lost basket.
        const cart = await cartService.cartGetWithSummary(user.id);
        expect(cart.items).toEqual([{ productId: String(product._id), quantity: 3 }]);
    });

    it('a failed line puts back what earlier lines already took', async () => {
        const user = await createUser();
        const plenty = await createProduct({ title: 'Plenty', stock: 50 });
        const scarce = await createProduct({ title: 'Scarce', stock: 1 });
        await cartService.cartItemAddById(user.id, String(plenty._id), 2);
        await cartService.cartItemAddById(user.id, String(scarce._id), 2);

        const result = await cartService.orderConfirm(user.id);

        expect(result.success).toBe(false);
        expect(await shelfCount(plenty._id)).toBe(50);
        expect(await shelfCount(scarce._id)).toBe(1);
    });

    it('two checkouts cannot share the last unit', async () => {
        const alice = await createUser({ email: 'alice@example.com', username: 'alice' });
        const bob = await createUser({ email: 'bob@example.com', username: 'bob' });
        const lastOne = await createProduct({ stock: 1 });
        await cartService.cartItemAddById(alice.id, String(lastOne._id), 1);
        await cartService.cartItemAddById(bob.id, String(lastOne._id), 1);

        const [first, second] = await Promise.all([
            cartService.orderConfirm(alice.id),
            cartService.orderConfirm(bob.id)
        ]);

        const outcomes = [first.success, second.success].toSorted();
        expect(outcomes).toEqual([false, true]);
        expect(await shelfCount(lastOne._id)).toBe(0);
    });
});

describe('the admin order create and stock', () => {
    it('decrements like checkout — the manual path sells the same shelf', async () => {
        const user = await createUser();
        const product = await createProduct({ stock: 10 });

        const result = await orderService.create(user.id, user.email, [
            { productId: String(product._id), quantity: 4 }
        ]);

        expect(result.success).toBe(true);
        expect(await shelfCount(product._id)).toBe(6);
    });

    it('refuses and rolls back when a line exceeds the shelf', async () => {
        const user = await createUser();
        const plenty = await createProduct({ title: 'Plenty', stock: 50 });
        const scarce = await createProduct({ title: 'Scarce', stock: 1 });

        const result = await orderService.create(user.id, user.email, [
            { productId: String(plenty._id), quantity: 2 },
            { productId: String(scarce._id), quantity: 5 }
        ]);

        expect(result.success).toBe(false);
        expect(result.status).toBe(409);
        expect(await shelfCount(plenty._id)).toBe(50);
        expect(await shelfCount(scarce._id)).toBe(1);
    });
});

describe('cancel and stock', () => {
    it('a cancelled order restores its units', async () => {
        const user = await createUser();
        const product = await createProduct({ stock: 10 });
        await cartService.cartItemAddById(user.id, String(product._id), 4);
        const checkout = await cartService.orderConfirm(user.id);
        expect(checkout.success).toBe(true);
        expect(await shelfCount(product._id)).toBe(6);

        const orderId = String(checkout.success && checkout.data?._id);
        const cancelled = await orderService.cancelById(orderId, {
            id: user.id,
            admin: false
        });

        expect(cancelled.success).toBe(true);
        expect(await shelfCount(product._id)).toBe(10);
    });

    it('a second cancel cannot restore twice', async () => {
        const user = await createUser();
        const product = await createProduct({ stock: 10 });
        await cartService.cartItemAddById(user.id, String(product._id), 4);
        const checkout = await cartService.orderConfirm(user.id);
        const orderId = String(checkout.success && checkout.data?._id);

        await orderService.cancelById(orderId, { id: user.id, admin: false });
        const again = await orderService.cancelById(orderId, { id: user.id, admin: false });

        expect(again.success).toBe(false);
        expect(await shelfCount(product._id)).toBe(10);
    });

    it("cancelling a checkout order does not disturb other products' shelves", async () => {
        const user = await createUser();
        const bought = await createProduct({ title: 'Bought', stock: 10 });
        const untouched = await createProduct({ title: 'Untouched', stock: 5 });
        await cartService.cartItemAddById(user.id, String(bought._id), 1);
        const checkout = await cartService.orderConfirm(user.id);
        const orderId = String(checkout.success && checkout.data?._id);

        await orderService.cancelById(orderId, { id: user.id, admin: false });

        expect(await shelfCount(bought._id)).toBe(10);
        expect(await shelfCount(untouched._id)).toBe(5);
        // The restored order really is cancelled, not merely refunded on the shelf.
        const stored = await orderRepository.findById(orderId);
        expect(stored?.status).toBe('cancelled');
    });
});
