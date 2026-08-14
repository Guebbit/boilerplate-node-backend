/**
 * Cart service — `src/modules/cart/service.ts`.
 *
 * The distinction that carries the most risk here is `set` vs `add`: `cartItemSetById` replaces a
 * line's quantity, `cartItemAddById` increments it. They share one private `upsertCartItem`
 * implementation, and the whole difference between them is `$set` against `$inc` on one line of
 * the repository — so a mutation that collapses them is invisible in review and produces a cart
 * that silently multiplies (or loses) what a user asked for. Several tests below exist only to
 * keep those two apart.
 *
 * The second is the over-serialization guard on the cart view. `CartItem` in `openapi.yaml` is
 * `additionalProperties: false` over `{ productId, quantity }`, so the populated `product` used to
 * price the cart must be dropped before the response leaves. Asserted here as well as in the
 * contract suite, because the contract suite only sees it when a route happens to be exercised.
 *
 * The third is storage: a cart is its own document keyed by `userId`, absent until the first write
 * and never carrying a per-line `_id`. Those are the facts the whole design rests on, so each has
 * an assertion of its own rather than being left to whatever a behavioural test happens to notice.
 *
 * Real Mongo throughout (`setupTestDb`), because most of this module's behaviour is what Mongo does
 * with the guarded writes behind `cartRepository.upsertLine` — including the two race tests, which
 * only mean anything against a server that actually serializes writes to one document. Mocking the
 * repository would assert the mock.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';

// The queue, not the copy: what checkout owes the customer is that a confirmation was DISPATCHED
// exactly when the order stood. The copy itself is pinned by the mailer template suite.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;
import { createUser } from '@modules/users/tests/factory';
import { createProduct } from '@modules/products/tests/factory';
import {
    cartGet,
    cartGetWithSummary,
    cartItemSetById,
    cartItemAddById,
    cartItemRemoveById,
    cartRemove,
    orderConfirm,
    productRemoveFromCartsById
} from '@modules/cart/services';
import { cartRepository } from '@modules/cart';
import { userService } from '@modules/users';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import cartModule from '@modules/cart/module';
import productsModule from '@modules/products/module';
import usersModule from '@modules/users/module';
import ordersModule from '@modules/orders/module';
import accountModule from '@modules/account/module';
import deliveryModule from '@modules/delivery/module';
import { orderRepository } from '@modules/orders';
import { productRepository } from '@modules/products';
import type { IResponseReject } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';

setupTestDb();

/** An id that is structurally valid but present in no collection. */
const MISSING_ID = '507f1f77bcf86cd799439011';

/** What every read answers for a user with nothing in their cart. */
const EMPTY_CART = { items: [], summary: { itemsCount: 0, totalQuantity: 0, total: 0 } };

const asReject = (result: unknown) => result as IResponseReject;

/** Reads the persisted quantity for a product, so assertions survive the round trip to Mongo. */
const storedQuantity = async (userId: string, productId: string): Promise<number | undefined> => {
    const cart = await cartRepository.findByUserId(userId);
    return cart?.items.find((item) => String(item.productId) === productId)?.quantity;
};

describe('cart storage', () => {
    it('holds no cart document until the first write', async () => {
        // Absence and an empty cart are the same state — nothing creates a placeholder.
        const user = await createUser();

        await expect(cartRepository.findByUserId(user.id)).resolves.toBeNull();
        await expect(cartGetWithSummary(user.id)).resolves.toEqual(EMPTY_CART);
    });

    it('creates the cart on the first add', async () => {
        const user = await createUser();
        const product = await createProduct();

        await cartItemSetById(user.id, String(product._id), 1);

        const cart = await cartRepository.findByUserId(user.id);
        expect(cart).not.toBeNull();
        expect(String(cart!.userId)).toBe(user.id);
    });

    it('stamps createdAt on the cart it creates', async () => {
        // The cart is born from an upsert rather than from a `create()`, so this is the one
        // collection whose `createdAt` depends on `timestamps` reaching the insert branch.
        const user = await createUser();
        const product = await createProduct();

        await cartItemSetById(user.id, String(product._id), 1);

        const cart = await cartRepository.findByUserId(user.id);
        expect(cart!.createdAt).toBeInstanceOf(Date);
    });

    it('stores a line as productId and quantity, with no id of its own', async () => {
        // `CartItem` is additionalProperties:false, so a generated subdocument `_id` would be a
        // contract violation the moment anything serialized a cart.
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 2);

        const cart = await cartRepository.findByUserId(user.id);

        expect(cart!.toObject().items).toEqual([{ productId: product._id, quantity: 2 }]);
    });

    it('keeps exactly one cart per user however many writes land', async () => {
        const user = await createUser();
        const keyboard = await createProduct({ title: 'Keyboard' });
        const mouse = await createProduct({ title: 'Mouse' });

        await cartItemSetById(user.id, String(keyboard._id), 1);
        await cartItemSetById(user.id, String(mouse._id), 1);
        await cartItemAddById(user.id, String(keyboard._id), 1);

        await expect(cartRepository.count({ userId: user._id })).resolves.toBe(1);
    });

    it('refreshes the cart timestamp on a write', async () => {
        const user = await createUser();
        const keyboard = await createProduct({ title: 'Keyboard' });
        const mouse = await createProduct({ title: 'Mouse' });
        await cartItemSetById(user.id, String(keyboard._id), 1);
        const before = (await cartRepository.findByUserId(user.id))!.updatedAt!;

        await cartItemSetById(user.id, String(mouse._id), 1);

        const after = (await cartRepository.findByUserId(user.id))!.updatedAt!;
        expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
});

describe('cartGet', () => {
    it('returns an empty cart for a user who has never added anything', async () => {
        const user = await createUser();

        await expect(cartGet(user.id)).resolves.toEqual([]);
    });

    it('returns an empty list for a user that does not exist', async () => {
        // A read, not a mutation: answering "no items" is more useful than throwing, and every
        // caller already renders an empty cart.
        await expect(cartGet(MISSING_ID)).resolves.toEqual([]);
    });

    it('returns the populated product alongside each line', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Keyboard', price: 25 });
        await cartItemSetById(user.id, String(product._id), 2);

        const items = await cartGet(user.id);

        expect(items).toHaveLength(1);
        expect(items[0].productId).toBe(String(product._id));
        expect(items[0].quantity).toBe(2);
        // This is the variant that deliberately DOES carry the product — it is what prices the
        // cart. See cartGetWithSummary for the one that must not.
        expect(items[0].product).toMatchObject({ title: 'Keyboard' });
    });

    it('keeps the product id on a line whose product has been deleted', async () => {
        // `populate()` writes `null` over the reference for a product that no longer exists, so a
        // caller reading the id off that field would lose it exactly when it matters most.
        const user = await createUser();
        const product = await createProduct({ title: 'Discontinued' });
        await cartItemSetById(user.id, String(product._id), 1);
        await product.deleteOne();

        const items = await cartGet(user.id);

        expect(items).toHaveLength(1);
        expect(items[0].productId).toBe(String(product._id));
        expect(items[0].quantity).toBe(1);
        expect(items[0].product).toBeNull();
    });
});

describe('cartGetWithSummary', () => {
    it('drops the populated product from every line', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Keyboard', price: 25 });
        await cartItemSetById(user.id, String(product._id), 2);

        const { items } = await cartGetWithSummary(user.id);

        // `CartItem` is additionalProperties:false — an extra key here is a contract violation.
        expect(items).toEqual([{ productId: String(product._id), quantity: 2 }]);
        expect(Object.keys(items[0])).toEqual(['productId', 'quantity']);
    });

    it('computes the summary across several lines', async () => {
        const user = await createUser();
        const keyboard = await createProduct({ title: 'Keyboard', price: 25 });
        const mouse = await createProduct({ title: 'Mouse', price: 10 });
        await cartItemSetById(user.id, String(keyboard._id), 2);
        await cartItemSetById(user.id, String(mouse._id), 3);

        const { summary } = await cartGetWithSummary(user.id);

        // Distinct numbers on purpose: 2 lines, 5 units, 80.00 total — no two of the three can
        // be confused for each other if one is computed wrongly.
        expect(summary).toEqual({ itemsCount: 2, totalQuantity: 5, total: 80 });
    });

    it('reports a zeroed summary for an empty cart', async () => {
        const user = await createUser();

        await expect(cartGetWithSummary(user.id)).resolves.toEqual(EMPTY_CART);
    });
});

describe('cartItemSetById', () => {
    it('adds a line that was not in the cart', async () => {
        const user = await createUser();
        const product = await createProduct();

        await cartItemSetById(user.id, String(product._id), 3);

        await expect(storedQuantity(user.id, String(product._id))).resolves.toBe(3);
    });

    it('REPLACES the quantity of a line already in the cart', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 5);

        await cartItemSetById(user.id, String(product._id), 2);

        // 2, not 7. This is the assertion that separates `set` from `add`.
        await expect(storedQuantity(user.id, String(product._id))).resolves.toBe(2);
    });

    it('defaults the quantity to 1', async () => {
        const user = await createUser();
        const product = await createProduct();

        await cartItemSetById(user.id, String(product._id));

        await expect(storedQuantity(user.id, String(product._id))).resolves.toBe(1);
    });

    it('does not disturb other lines', async () => {
        const user = await createUser();
        const keyboard = await createProduct({ title: 'Keyboard' });
        const mouse = await createProduct({ title: 'Mouse' });
        await cartItemSetById(user.id, String(keyboard._id), 4);

        await cartItemSetById(user.id, String(mouse._id), 1);

        await expect(storedQuantity(user.id, String(keyboard._id))).resolves.toBe(4);
        await expect(storedQuantity(user.id, String(mouse._id))).resolves.toBe(1);
    });

    it('answers with the updated cart, so no controller has to re-read it', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 25 });

        const cart = await cartItemSetById(user.id, String(product._id), 2);

        expect(cart).toEqual({
            items: [{ productId: String(product._id), quantity: 2 }],
            summary: { itemsCount: 1, totalQuantity: 2, total: 50 }
        });
    });

    it('touches only the calling user cart', async () => {
        const first = await createUser({ email: 'first@example.com' });
        const second = await createUser({ email: 'second@example.com' });
        const product = await createProduct();
        await cartItemSetById(first.id, String(product._id), 1);

        await cartItemSetById(second.id, String(product._id), 9);

        await expect(storedQuantity(first.id, String(product._id))).resolves.toBe(1);
    });
});

describe('cartItemAddById', () => {
    it('adds a line that was not in the cart', async () => {
        const user = await createUser();
        const product = await createProduct();

        await cartItemAddById(user.id, String(product._id), 3);

        // On a missing line, add and set are indistinguishable — both create it at `quantity`.
        await expect(storedQuantity(user.id, String(product._id))).resolves.toBe(3);
    });

    it('INCREMENTS the quantity of a line already in the cart', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 5);

        await cartItemAddById(user.id, String(product._id), 2);

        // 7, not 2. The mirror of the `set` assertion above.
        await expect(storedQuantity(user.id, String(product._id))).resolves.toBe(7);
    });

    it('accumulates across repeated calls', async () => {
        const user = await createUser();
        const product = await createProduct();

        await cartItemAddById(user.id, String(product._id), 1);
        await cartItemAddById(user.id, String(product._id), 1);
        await cartItemAddById(user.id, String(product._id), 1);

        await expect(storedQuantity(user.id, String(product._id))).resolves.toBe(3);
    });

    it('loses none of three overlapping increments', async () => {
        // The increment is evaluated by Mongo against the stored document, so overlapping writes
        // cannot each compute from the same stale quantity — which is precisely what a
        // read-modify-write through the user document did.
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);

        await Promise.all([
            cartItemAddById(user.id, String(product._id), 1),
            cartItemAddById(user.id, String(product._id), 1),
            cartItemAddById(user.id, String(product._id), 1)
        ]);

        await expect(storedQuantity(user.id, String(product._id))).resolves.toBe(4);
    });

    it('gives two racing first-adds one cart holding both lines', async () => {
        // Nothing exists yet, so both requests reach the `upsert`. Whether they collide on the
        // unique `userId` index is a matter of timing — usually the second finds the cart the
        // first inserted and simply appends — so this pins the outcome, not the path. The
        // duplicate-key retry is exercised deterministically by the same-product case below.
        const user = await createUser();
        const keyboard = await createProduct({ title: 'Keyboard' });
        const mouse = await createProduct({ title: 'Mouse' });

        await Promise.all([
            cartItemAddById(user.id, String(keyboard._id), 1),
            cartItemAddById(user.id, String(mouse._id), 1)
        ]);

        await expect(cartRepository.count({ userId: user._id })).resolves.toBe(1);
        await expect(storedQuantity(user.id, String(keyboard._id))).resolves.toBe(1);
        await expect(storedQuantity(user.id, String(mouse._id))).resolves.toBe(1);
    });

    it('opens one line, not two, when the same new product is added twice at once', async () => {
        // The race the `$ne` guard exists for: two tabs adding a product the cart has never held.
        // Both append steps ask Mongo "and only if this product is absent", so the one that loses
        // matches nothing and comes back through the increment instead of pushing a second line.
        const user = await createUser();
        const anchor = await createProduct({ title: 'Anchor' });
        const product = await createProduct({ title: 'Contested' });
        // The cart has to exist first — this pins the line-level race, not the cart-level one.
        await cartItemSetById(user.id, String(anchor._id), 1);

        await Promise.all([
            cartItemAddById(user.id, String(product._id), 1),
            cartItemAddById(user.id, String(product._id), 1)
        ]);

        const cart = await cartRepository.findByUserId(user.id);
        expect(
            cart!.items.filter((item) => String(item.productId) === String(product._id))
        ).toHaveLength(1);
        await expect(storedQuantity(user.id, String(product._id))).resolves.toBe(2);
    });
});

describe('cartItemRemoveById', () => {
    it('removes the targeted line and answers with what is left', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 2);

        const result = await cartItemRemoveById(user.id, String(product._id));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(EMPTY_CART);
        await expect(cartGet(user.id)).resolves.toEqual([]);
    });

    it('leaves the other lines alone', async () => {
        const user = await createUser();
        const keyboard = await createProduct({ title: 'Keyboard' });
        const mouse = await createProduct({ title: 'Mouse' });
        await cartItemSetById(user.id, String(keyboard._id), 1);
        await cartItemSetById(user.id, String(mouse._id), 2);

        await cartItemRemoveById(user.id, String(keyboard._id));

        const items = await cartGet(user.id);
        expect(items).toHaveLength(1);
        expect(items[0].productId).toBe(String(mouse._id));
    });

    it('rejects with 404 when the product is not in the cart', async () => {
        // Distinguished from "removed nothing, all good": a client that deletes a line it cannot
        // see needs to know its view is stale.
        const user = await createUser();
        const other = await createProduct({ title: 'Other' });
        const product = await createProduct();
        await cartItemSetById(user.id, String(other._id), 1);

        const result = await cartItemRemoveById(user.id, String(product._id));

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });

    it('rejects with 404 when the user has no cart at all', async () => {
        // One filter covers both misses — no cart and no such line are the same answer.
        const user = await createUser();
        const product = await createProduct();

        const result = await cartItemRemoveById(user.id, String(product._id));

        expect(asReject(result).status).toBe(404);
    });

    it('leaves an empty cart behind when the last line goes', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);

        const result = await cartItemRemoveById(user.id, String(product._id));

        expect(result.success).toBe(true);
        await expect(cartGet(user.id)).resolves.toEqual([]);
    });
});

describe('cartRemove', () => {
    it('clears every line and answers with the empty cart', async () => {
        const user = await createUser();
        const keyboard = await createProduct({ title: 'Keyboard' });
        const mouse = await createProduct({ title: 'Mouse' });
        await cartItemSetById(user.id, String(keyboard._id), 1);
        await cartItemSetById(user.id, String(mouse._id), 2);

        await expect(cartRemove(user.id)).resolves.toEqual(EMPTY_CART);
        await expect(cartGet(user.id)).resolves.toEqual([]);
    });

    it('succeeds on an already-empty cart', async () => {
        // Idempotent by design — clearing twice must not fail.
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);
        await cartRemove(user.id);

        await expect(cartRemove(user.id)).resolves.toEqual(EMPTY_CART);
    });

    it('writes nothing for a user who never had a cart', async () => {
        // Clearing must not be the thing that brings a cart document into existence.
        const user = await createUser();

        await expect(cartRemove(user.id)).resolves.toEqual(EMPTY_CART);
        await expect(cartRepository.findByUserId(user.id)).resolves.toBeNull();
    });
});

describe('orderConfirm', () => {
    it('creates an order carrying the cart lines', async () => {
        const user = await createUser();
        const keyboard = await createProduct({ title: 'Keyboard', price: 25 });
        const mouse = await createProduct({ title: 'Mouse', price: 10 });
        await cartItemSetById(user.id, String(keyboard._id), 2);
        await cartItemSetById(user.id, String(mouse._id), 1);

        const result = await orderConfirm(user.id);

        expect(result.success).toBe(true);
        await expect(orderRepository.count({ userId: user._id })).resolves.toBe(1);
        const order = await orderRepository.findOne({ userId: user._id });
        expect(order!.items).toHaveLength(2);
        expect(order!.email).toBe(user.email);
    });

    it('empties the cart once the order exists', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);

        await orderConfirm(user.id);

        // Ordering matters: the cart must only be cleared after the order was created, or a
        // failure mid-checkout loses the basket.
        await expect(cartGet(user.id)).resolves.toEqual([]);
    });

    it('rejects an empty cart with 409 and creates nothing', async () => {
        const user = await createUser();

        const result = await orderConfirm(user.id);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(409);
        await expect(orderRepository.count({ userId: user._id })).resolves.toBe(0);
    });

    /*
     * The failure CODE, not just the status. Two of the three reasons share 409, so the status
     * cannot tell them apart — and `postCheckout` reports this code as the `CHECKOUT_FAILED`
     * analytics reason, where a translated sentence would vary by locale and a bare 409 would merge
     * "empty basket" with "someone else changed it". `message` stays translated for the user.
     */
    it('names an empty cart CART_EMPTY, with translated copy for the user', async () => {
        const user = await createUser();

        const result = await orderConfirm(user.id);

        const [error] = asReject(result).errors;
        expect(error.code).toBe('CART_EMPTY');
        expect(error.message).toBe(t('cart.empty'));
    });

    it('rejects with 404 for a user that does not exist', async () => {
        // The one cart operation that still needs the user: an order records the address it was
        // placed from, and there is none to record.
        const result = await orderConfirm(MISSING_ID);

        expect(asReject(result).status).toBe(404);
    });

    it('rejects with 404 when a line points at a deleted product', async () => {
        // An order embeds a snapshot, and there is nothing to snapshot.
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);
        await product.deleteOne();

        const result = await orderConfirm(user.id);

        expect(asReject(result).status).toBe(404);
        await expect(orderRepository.count({ userId: user._id })).resolves.toBe(0);
    });

    it('freezes the chosen shipping method and its cost onto the order', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 25 });
        await cartItemSetById(user.id, String(product._id), 2);

        const result = await orderConfirm(user.id, undefined, 'express');

        expect(result.success).toBe(true);
        const order = await orderRepository.findOne({ userId: user._id });
        expect(order!.shippingMethod).toBe('express');
        expect(order!.shippingCost).toBe(15);
    });

    it('prices the free-above rule against the lines being bought', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 60 });
        await cartItemSetById(user.id, String(product._id), 2); // 120 ≥ standard's 100

        const result = await orderConfirm(user.id, undefined, 'standard');

        expect(result.success).toBe(true);
        const order = await orderRepository.findOne({ userId: user._id });
        expect(order!.shippingCost).toBe(0);
    });

    it('refuses an unknown shipping method before anything is written', async () => {
        const user = await createUser();
        const product = await createProduct({ stock: 5 });
        await cartItemSetById(user.id, String(product._id), 2);

        const result = await orderConfirm(user.id, undefined, 'teleport');

        expect(asReject(result).status).toBe(404);
        expect(asReject(result).errors[0]!.code).toBe('CART_SHIPPING_METHOD_NOT_FOUND');
        // Nothing moved: no order, full shelf, full cart.
        await expect(orderRepository.count({ userId: user._id })).resolves.toBe(0);
        const stored = await productRepository.findByIdRaw(String(product._id));
        expect(stored!.stock).toBe(5);
    });

    it('an omitted method leaves the order without shipping — buying does not require it', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);

        await orderConfirm(user.id);

        const order = await orderRepository.findOne({ userId: user._id });
        expect(order!.shippingMethod).toBeUndefined();
        expect(order!.shippingCost).toBeUndefined();
    });

    it('sends the customer a confirmation email listing the bought lines', async () => {
        mockEnqueueEmail.mockClear();
        const user = await createUser();
        const keyboard = await createProduct({ title: 'Keyboard', price: 25 });
        await cartItemSetById(user.id, String(keyboard._id), 2);

        const result = await orderConfirm(user.id);

        expect(result.success).toBe(true);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(user.email);
        expect(template).toBe('orders.order-confirm.ejs');
        // The lines are the order's own snapshot, priced — not the cart's ids.
        expect(data?.lines).toEqual(['Keyboard — 2 × 25']);
        expect(data?.total).toBe('Total: 50');
    });

    it('sends no email when the checkout is refused', async () => {
        // "Stock moved if and only if the order stands" extends to the inbox: a refused
        // checkout must not congratulate anyone.
        mockEnqueueEmail.mockClear();
        const user = await createUser();

        await orderConfirm(user.id);

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('names a vanished product CART_PRODUCT_UNAVAILABLE', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);
        await product.deleteOne();

        const result = await orderConfirm(user.id);

        const [error] = asReject(result).errors;
        expect(error.code).toBe('CART_PRODUCT_UNAVAILABLE');
        expect(error.message).toBe(t('cart.product-unavailable'));
    });
});

describe('productRemoveFromCartsById', () => {
    it('removes the product from every cart that holds it', async () => {
        const first = await createUser({ email: 'first@example.com' });
        const second = await createUser({ email: 'second@example.com' });
        const doomed = await createProduct({ title: 'Discontinued' });
        const kept = await createProduct({ title: 'Kept' });
        await cartItemSetById(first.id, String(doomed._id), 1);
        await cartItemSetById(first.id, String(kept._id), 2);
        await cartItemSetById(second.id, String(doomed._id), 3);

        const result = await productRemoveFromCartsById(String(doomed._id));

        expect(result.success).toBe(true);
        // Both carts cleaned, and the unrelated line survives — a `$pull` that matched too
        // broadly would empty the whole cart instead.
        await expect(cartGet(second.id)).resolves.toEqual([]);
        const firstItems = await cartGet(first.id);
        expect(firstItems).toHaveLength(1);
        expect(firstItems[0].productId).toBe(String(kept._id));
    });

    it('reports how many carts were touched', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);

        const result = await productRemoveFromCartsById(String(product._id));

        expect(result.message).toContain('1 cart(s)');
    });

    it('succeeds and reports zero when no cart holds the product', async () => {
        const product = await createProduct();

        const result = await productRemoveFromCartsById(String(product._id));

        expect(result.success).toBe(true);
        expect(result.message).toContain('0 cart(s)');
    });
});

/**
 * Registers the modules for real rather than reaching into the users service directly. The list is
 * the cart's dependency closure, not just the two domains at play: the registry refuses to install
 * a module whose `dependsOn` names something absent.
 *
 * The users module no longer calls the cart — it emits `user.deleted` and this module subscribes.
 * That subscription only exists once the registry has run, so a test that skipped it would assert
 * the cleanup never happens and pass for the wrong reason.
 */
describe('cartDeleteByUserId', () => {
    beforeEach(() => {
        registerModules([
            accountModule,
            deliveryModule,
            productsModule,
            usersModule,
            ordersModule,
            cartModule
        ]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('takes the cart with a hard-deleted account', async () => {
        // While the cart lived inside the user document this came free. It does not any more, and
        // a cart is reachable only through its owner — so one left behind is unreadable forever.
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 2);

        await userService.remove(user, true);

        await expect(cartRepository.findByUserId(user.id)).resolves.toBeNull();
    });

    it('keeps the cart when the account is only soft-deleted', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 2);

        await userService.remove(user, false);

        await expect(cartRepository.findByUserId(user.id)).resolves.not.toBeNull();
    });
});
