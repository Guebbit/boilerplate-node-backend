/**
 * @module
 * Cart service tests — `src/modules/cart/services/`. Highest-risk seam: `set` vs `add` share
 * one private `upsertCartItem` (`services/items.ts`), differing only in `$set` vs `$inc` on one
 * repository line — a
 * collapsed mutation is invisible in review and silently multiplies or drops a user's quantity.
 * Also pins the over-serialization guard on the cart view, and that a cart is its own per-user
 * document with no per-line `_id`. Real Mongo throughout (`setupTestDb`) — the behaviour lives
 * in `cartRepository.upsertLine`'s guarded writes, which a mock can't exercise.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironment, withoutEnvironment } from '@tests/environment';
import { enqueueEmail } from '@infrastructure/adapters/mailer';

// The queue, not the copy: what checkout owes the customer is that a confirmation was DISPATCHED
// exactly when the order stood. The copy itself is pinned by the mailer template suite.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

/*
 * `sendOrderPlacedEmail` renders the invoice before it dispatches — fire-and-forget, deliberately,
 * so a Chromium launch never stretches out checkout's own response. `renderInvoicePdf` is real
 * here otherwise (no Chromium stub configured in this file), so it is mocked to answer "nothing to
 * attach" instead: the enqueue itself, still exactly one microtask chain away from `orderConfirm`
 * returning, is what `flush()` below waits out.
 */
const renderInvoicePdfMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../orders/services/invoice', () => ({
    ...jest.requireActual('../../../orders/services/invoice'),
    renderInvoicePdf: (orderId: string) => renderInvoicePdfMock(orderId)
}));

/** Waits out `sendOrderPlacedEmail`'s own fire-and-forget chain, so its `enqueueEmail` call has
 * already landed before a case clears or asserts on the mock. */
const flush = () => new Promise((resolve) => setImmediate(resolve));
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import {
    cartGet,
    cartGetForBadge,
    cartItemSetById,
    cartItemAddById,
    cartItemRemoveById,
    cartRemove,
    orderConfirm,
    cartService,
    productRemoveFromCartsById
} from '@modules/cart/services';
import { cartRepository } from '@modules/cart/repository';
import { userService } from '@modules/users';
import { asCustomer, testCallerContext } from '@tests/callers';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents, emitDomainEvent } from '@kernel/events';
import { PRODUCT_DELETED } from '@modules/products';
import { logger } from '@infrastructure/adapters/logger';
import cartModule from '@modules/cart/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { countOrders, findOrder } from '@modules/orders/tests/factories';
import { productService } from '@modules/products';
import { asReject } from '@tests/response';
import { t } from '@infrastructure/i18n';
import { MISSING_ID } from '@tests/ids';

setupTestDb();

/** What every read answers for a user with nothing in their cart. */
const EMPTY_CART = { items: [], summary: { itemsCount: 0, totalQuantity: 0, total: 0 } };

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
        await expect(cartGetForBadge(user.id)).resolves.toEqual(EMPTY_CART);
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
        // cart. See cartGetForBadge for the one that must not.
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

describe('cartGetForBadge', () => {
    it('drops the populated product from every line', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Keyboard', price: 25 });
        await cartItemSetById(user.id, String(product._id), 2);

        const { items } = await cartGetForBadge(user.id);

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

        const { summary } = await cartGetForBadge(user.id);

        // Distinct numbers on purpose: 2 lines, 5 units, 80.00 total — no two of the three can
        // be confused for each other if one is computed wrongly.
        expect(summary).toEqual({ itemsCount: 2, totalQuantity: 5, total: 80 });
    });

    it('reports a zeroed summary for an empty cart', async () => {
        const user = await createUser();

        await expect(cartGetForBadge(user.id)).resolves.toEqual(EMPTY_CART);
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

        const result = await cartItemSetById(user.id, String(product._id), 2);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            items: [{ productId: String(product._id), quantity: 2 }],
            summary: { itemsCount: 1, totalQuantity: 2, total: 50 }
        });
    });

    /*
     * The catalogue gate, from the service rather than through a route.
     *
     * Both halves of `findPublicById`'s predicate get their own case: they are independent
     * conditions, and one fixture cannot say which of them did the refusing.
     */
    it('refuses a product the storefront would not show, and writes nothing', async () => {
        const user = await createUser();
        const hidden = await createProduct({ active: false });

        const result = await cartItemSetById(user.id, String(hidden._id), 1);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        await expect(storedQuantity(user.id, String(hidden._id))).resolves.toBeUndefined();
    });

    it('refuses a soft-deleted product, and writes nothing', async () => {
        const user = await createUser();
        const product = await createProduct();
        await productService.removeById(String(product._id));

        const result = await cartItemSetById(user.id, String(product._id), 1);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        await expect(storedQuantity(user.id, String(product._id))).resolves.toBeUndefined();
    });

    /*
     * The quietest failure the gate prevents: a well-formed id no product has ever had. Without
     * the check it stores a line that every response then omits — `readCartLines` drops a
     * reference resolving to nothing — so the write looks like it did nothing at all.
     */
    it('refuses an id no product has ever had, and writes nothing', async () => {
        const user = await createUser();
        const missing = '65dc8a99604c307b702b5ccc';

        const result = await cartItemSetById(user.id, missing, 1);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        await expect(storedQuantity(user.id, missing)).resolves.toBeUndefined();
    });

    it('touches only the calling user cart', async () => {
        const first = await createUser({ email: 'first@example.com' });
        const second = await createUser({ email: 'second@example.com' });
        const product = await createProduct();
        await cartItemSetById(first.id, String(product._id), 1);

        await cartItemSetById(second.id, String(product._id), 9);

        await expect(storedQuantity(first.id, String(product._id))).resolves.toBe(1);
    });

    it('sets a line straight to the 999 cap — the set path never goes through the add refusal', async () => {
        const user = await createUser();
        const product = await createProduct();

        const result = await cartItemSetById(user.id, String(product._id), 999);

        expect(result.success).toBe(true);
        await expect(storedQuantity(user.id, String(product._id))).resolves.toBe(999);
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

    /*
     * The line, not just the request: `UpsertCartItemRequest.quantity` already bounds one
     * request to 999, but nothing stopped two `'add'`s from clearing that ceiling together until
     * the repository filter carried the cap itself.
     */
    it('refuses an add that would push a line past 999, and changes nothing', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 999);

        const result = await cartItemAddById(user.id, String(product._id), 1);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(422);
        const [error] = asReject(result).errors;
        expect(error.code).toBe('CART_QUANTITY_LIMIT');
        expect(error.message).toBe(t('cart.quantity-limit'));
        await expect(storedQuantity(user.id, String(product._id))).resolves.toBe(999);
    });
});

describe('reorderIntoCart', () => {
    it('clamps a reordered line to 999 instead of pushing it past the cap', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 998);
        const order = await createOrder(user, [toOrderItem(product, 2)]);

        const result = await cartService.reorderIntoCart(
            asCustomer(user.id),
            String(order._id),
            testCallerContext
        );

        expect(result.success).toBe(true);
        // 999, not 1000: the order asked to add 2, only 1 fit.
        await expect(storedQuantity(user.id, String(product._id))).resolves.toBe(999);
    });

    it('skips a line already at 999, the same as an unavailable product', async () => {
        const user = await createUser();
        const kept = await createProduct({ title: 'Kept' });
        const full = await createProduct({ title: 'Full' });
        await cartItemSetById(user.id, String(full._id), 999);
        const order = await createOrder(user, [toOrderItem(kept, 1), toOrderItem(full, 1)]);

        const result = await cartService.reorderIntoCart(
            asCustomer(user.id),
            String(order._id),
            testCallerContext
        );

        expect(result.success).toBe(true);
        await expect(storedQuantity(user.id, String(kept._id))).resolves.toBe(1);
        await expect(storedQuantity(user.id, String(full._id))).resolves.toBe(999);
    });
});

describe('cartItemRemoveById', () => {
    it('removes the targeted line and answers with what is left', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 2);

        const result = await cartItemRemoveById(user.id, String(product._id), testCallerContext);

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

        await cartItemRemoveById(user.id, String(keyboard._id), testCallerContext);

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

        const result = await cartItemRemoveById(user.id, String(product._id), testCallerContext);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });

    it('rejects with 404 when the user has no cart at all', async () => {
        // One filter covers both misses — no cart and no such line are the same answer.
        const user = await createUser();
        const product = await createProduct();

        const result = await cartItemRemoveById(user.id, String(product._id), testCallerContext);

        expect(asReject(result).status).toBe(404);
    });

    it('leaves an empty cart behind when the last line goes', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);

        const result = await cartItemRemoveById(user.id, String(product._id), testCallerContext);

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

        await expect(cartRemove(user.id, testCallerContext)).resolves.toEqual(EMPTY_CART);
        await expect(cartGet(user.id)).resolves.toEqual([]);
    });

    it('succeeds on an already-empty cart', async () => {
        // Idempotent by design — clearing twice must not fail.
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);
        await cartRemove(user.id, testCallerContext);

        await expect(cartRemove(user.id, testCallerContext)).resolves.toEqual(EMPTY_CART);
    });

    it('writes nothing for a user who never had a cart', async () => {
        // Clearing must not be the thing that brings a cart document into existence.
        const user = await createUser();

        await expect(cartRemove(user.id, testCallerContext)).resolves.toEqual(EMPTY_CART);
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

        const result = await orderConfirm(user.id, testCallerContext);

        expect(result.success).toBe(true);
        await expect(countOrders({ userId: user._id })).resolves.toBe(1);
        const order = await findOrder({ userId: user._id });
        expect(order!.items).toHaveLength(2);
        expect(order!.email).toBe(user.email);
    });

    it('empties the cart once the order exists', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);

        await orderConfirm(user.id, testCallerContext);

        // Ordering matters: the cart must only be cleared after the order was created, or a
        // failure mid-checkout loses the basket.
        await expect(cartGet(user.id)).resolves.toEqual([]);
    });

    it('rejects an empty cart with 409 and creates nothing', async () => {
        const user = await createUser();

        const result = await orderConfirm(user.id, testCallerContext);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(409);
        await expect(countOrders({ userId: user._id })).resolves.toBe(0);
    });

    /*
     * The failure CODE, not just the status. Two of the three reasons share 409, so the status
     * cannot tell them apart — and `postCheckout` reports this code as the `CHECKOUT_FAILED`
     * analytics reason, where a translated sentence would vary by locale and a bare 409 would merge
     * "empty basket" with "someone else changed it". `message` stays translated for the user.
     */
    it('names an empty cart CART_EMPTY, with translated copy for the user', async () => {
        const user = await createUser();

        const result = await orderConfirm(user.id, testCallerContext);

        const [error] = asReject(result).errors;
        expect(error.code).toBe('CART_EMPTY');
        expect(error.message).toBe(t('cart.empty'));
    });

    it('rejects with 404 for a user that does not exist', async () => {
        // The one cart operation that still needs the user: an order records the address it was
        // placed from, and there is none to record.
        const result = await orderConfirm(MISSING_ID, testCallerContext);

        expect(asReject(result).status).toBe(404);
    });

    it('rejects with 404 when a line points at a deleted product', async () => {
        // An order embeds a snapshot, and there is nothing to snapshot.
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);
        await product.deleteOne();

        const result = await orderConfirm(user.id, testCallerContext);

        expect(asReject(result).status).toBe(404);
        await expect(countOrders({ userId: user._id })).resolves.toBe(0);
    });

    it('freezes the chosen shipping method and its cost onto the order', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 25 });
        await cartItemSetById(user.id, String(product._id), 2);

        const result = await orderConfirm(user.id, testCallerContext, undefined, 'express');

        expect(result.success).toBe(true);
        const order = await findOrder({ userId: user._id });
        expect(order!.shippingMethod).toBe('express');
        expect(order!.shippingCost).toBe(15);
    });

    it('prices the free-above rule against the lines being bought', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 60 });
        await cartItemSetById(user.id, String(product._id), 2); // 120 ≥ standard's 100

        const result = await orderConfirm(user.id, testCallerContext, undefined, 'standard');

        expect(result.success).toBe(true);
        const order = await findOrder({ userId: user._id });
        expect(order!.shippingCost).toBe(0);
    });

    it('refuses an unknown shipping method before anything is written', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        await cartItemSetById(user.id, String(product._id), 2);

        const result = await orderConfirm(user.id, testCallerContext, undefined, 'teleport');

        expect(asReject(result).status).toBe(404);
        expect(asReject(result).errors[0].code).toBe('CART_SHIPPING_METHOD_NOT_FOUND');
        // Nothing moved: no order, full shelf, full cart.
        await expect(countOrders({ userId: user._id })).resolves.toBe(0);
        const stored = await productService.findByIdRaw(String(product._id));
        expect(stored!.onHand).toBe(5);
        expect(stored!.reserved).toBe(0);
    });

    it('an omitted method leaves both shipping fields absent', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);

        await orderConfirm(user.id, testCallerContext);

        const order = await findOrder({ userId: user._id });
        // Both absent together, per `shared/contracts/openapi.root.yaml`: "shipping is not
        // required to buy". A chosen method that happens to cost 0 (`pickup`, or `standard`
        // above `freeAbove`) is a DIFFERENT state — `shippingMethod` present, cost legitimately 0.
        expect(order!.shippingMethod).toBeUndefined();
        expect(order!.shippingCost).toBeUndefined();
    });

    it('a chosen method that costs nothing still freezes the method, unlike no method at all', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 500 });
        await cartItemSetById(user.id, String(product._id), 1);

        // `standard` (5, freeAbove: 100) — a 500 line total clears the threshold.
        await orderConfirm(user.id, testCallerContext, undefined, 'standard');

        const order = await findOrder({ userId: user._id });
        expect(order!.shippingMethod).toBe('standard');
        expect(order!.shippingCost).toBe(0);
    });

    it('refuses a shipping method for a cart made entirely of digital products', async () => {
        const user = await createUser();
        const ebook = await createProduct({ requiresShipping: false });
        await cartItemSetById(user.id, String(ebook._id), 1);

        const result = await orderConfirm(user.id, testCallerContext, undefined, 'standard');

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('CART_SHIPPING_NOT_APPLICABLE');
        await expect(countOrders({ userId: user._id })).resolves.toBe(0);
    });

    it('refuses a shipping method the basket is too heavy for', async () => {
        const user = await createUser();
        // Express's ceiling is 5000g; two of these clear it.
        const product = await createProduct({ weight: 3000 });
        await cartItemSetById(user.id, String(product._id), 2);

        const result = await orderConfirm(user.id, testCallerContext, undefined, 'express');

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('CART_SHIPPING_METHOD_WEIGHT');
        await expect(countOrders({ userId: user._id })).resolves.toBe(0);
    });

    it('accepts the same basket under a method with room for it', async () => {
        const user = await createUser();
        // Over express's 5000g ceiling, comfortably under standard's 30000g one.
        const product = await createProduct({ weight: 3000 });
        await cartItemSetById(user.id, String(product._id), 2);

        const result = await orderConfirm(user.id, testCallerContext, undefined, 'standard');

        expect(result.success).toBe(true);
    });

    it('treats a product with no weight as weighing nothing, never refusing on that account', async () => {
        const user = await createUser();
        const product = await createProduct(); // no `weight` override
        await cartItemSetById(user.id, String(product._id), 1);

        const result = await orderConfirm(user.id, testCallerContext, undefined, 'express');

        expect(result.success).toBe(true);
    });

    it('checks out a digital-only cart with no method at all, same as any other', async () => {
        const user = await createUser();
        const ebook = await createProduct({ requiresShipping: false });
        await cartItemSetById(user.id, String(ebook._id), 1);

        await orderConfirm(user.id, testCallerContext);

        const order = await findOrder({ userId: user._id });
        expect(order!.shippingMethod).toBeUndefined();
        expect(order!.shippingCost).toBeUndefined();
    });

    it('still allows a shipping method when only SOME lines are digital', async () => {
        const user = await createUser();
        const ebook = await createProduct({ requiresShipping: false });
        const mug = await createProduct({ requiresShipping: true, price: 500 });
        await cartItemSetById(user.id, String(ebook._id), 1);
        await cartItemAddById(user.id, String(mug._id), 1);

        await orderConfirm(user.id, testCallerContext, undefined, 'standard');

        const order = await findOrder({ userId: user._id });
        expect(order!.shippingMethod).toBe('standard');
    });

    it('sends the customer a confirmation email listing the bought lines', async () => {
        mockEnqueueEmail.mockClear();
        const user = await createUser();
        const keyboard = await createProduct({ title: 'Keyboard', price: 25 });
        await cartItemSetById(user.id, String(keyboard._id), 2);

        const result = await orderConfirm(user.id, testCallerContext);
        await flush();

        expect(result.success).toBe(true);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(user.email);
        expect(template).toBe('orders.order-confirm');
        // The lines are the order's own snapshot, priced — not the cart's ids.
        expect(data?.lines).toEqual(['Keyboard — 2 × 25']);
        expect(data?.total).toBe('Total: 50');
    });

    it('sends no email when the checkout is refused', async () => {
        // "Stock moved if and only if the order stands" extends to the inbox: a refused
        // checkout must not congratulate anyone.
        mockEnqueueEmail.mockClear();
        const user = await createUser();

        await orderConfirm(user.id, testCallerContext);

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('names a vanished product CART_PRODUCT_UNAVAILABLE', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);
        await product.deleteOne();

        const result = await orderConfirm(user.id, testCallerContext);

        const [error] = asReject(result).errors;
        expect(error.code).toBe('CART_PRODUCT_UNAVAILABLE');
        expect(error.message).toBe(t('cart.product-unavailable'));
    });
});

/** Runs `body` with `bank_transfer` offered — both required env vars, restored afterwards. */
const withBankTransferConfigured = (body: () => Promise<void>) =>
    withEnvironment('NODE_BANK_TRANSFER_BENEFICIARY', 'Guebbit Shop', () =>
        withEnvironment('NODE_BANK_TRANSFER_IBAN', 'DE89370400440532013000', body)
    );

describe('orderConfirm — paymentMethod', () => {
    it('defaults to card, with no payBy', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);

        await orderConfirm(user.id, testCallerContext);

        const order = await findOrder({ userId: user._id });
        expect(order!.paymentMethod).toBe('card');
        expect(order!.payBy).toBeUndefined();
    });

    it('refuses bank_transfer when this deployment has not configured it', () =>
        // Explicitly unset: `tests/support/setup.ts` configures transfer for the whole worker, so
        // "this deployment offers no transfer" is a state this case has to create.
        withoutEnvironment(
            ['NODE_BANK_TRANSFER_BENEFICIARY', 'NODE_BANK_TRANSFER_IBAN'],
            async () => {
                const user = await createUser();
                const product = await createProduct();
                await cartItemSetById(user.id, String(product._id), 1);

                const result = await orderConfirm(
                    user.id,
                    testCallerContext,
                    undefined,
                    undefined,
                    'bank_transfer'
                );

                expect(asReject(result).status).toBe(409);
                expect(asReject(result).errors[0].code).toBe('CART_PAYMENT_METHOD_NOT_AVAILABLE');
                await expect(countOrders({ userId: user._id })).resolves.toBe(0);
            }
        ));

    it(
        'stamps paymentMethod and a payBy the configured hold-hours away',
        () =>
            withBankTransferConfigured(() =>
                withEnvironment('NODE_BANK_TRANSFER_HOLD_HOURS', '48', async () => {
                    const user = await createUser();
                    const product = await createProduct();
                    await cartItemSetById(user.id, String(product._id), 1);

                    const before = Date.now();
                    const result = await orderConfirm(
                        user.id,
                        testCallerContext,
                        undefined,
                        undefined,
                        'bank_transfer'
                    );

                    expect(result.success).toBe(true);
                    const order = await findOrder({ userId: user._id });
                    expect(order!.paymentMethod).toBe('bank_transfer');
                    // A window, not an exact millisecond: the checkout itself takes some time
                    // between `Date.now()` here and the write inside `runCheckout`.
                    const expected = before + 48 * 60 * 60_000;
                    expect(order!.payBy!.getTime()).toBeGreaterThanOrEqual(expected - 5000);
                    expect(order!.payBy!.getTime()).toBeLessThanOrEqual(expected + 5000);
                })
            ),
        10_000
    );

    it('serves transferInstructions on the still-pending order, with its own RF reference', () =>
        withBankTransferConfigured(async () => {
            const user = await createUser();
            const product = await createProduct();
            await cartItemSetById(user.id, String(product._id), 1);

            await orderConfirm(user.id, testCallerContext, undefined, undefined, 'bank_transfer');

            const stored = await findOrder({ userId: user._id });
            // `toJSON()`'s static type mirrors the stored document, not the transform this
            // module's model wires in — the same `unknown`-typed handoff
            // `postCheckout`'s own `toOrderResponse` uses for this boundary.
            const raw: unknown = stored!.toJSON();
            const serialized = raw as {
                transferInstructions?: { beneficiary: string; iban: string; reference: string };
            };
            // The exact code is `buildReference`'s own concern, pinned in
            // `transfer-reference.test.ts`;
            // what this pins is that checkout minted one and stamped it on the order BEFORE
            // quoting it back here, rather than the raw id the field replaced.
            expect(stored!.transferReference).toMatch(/^RF\d{2}[\dA-Z]{19}$/);
            expect(serialized.transferInstructions).toEqual({
                beneficiary: 'Guebbit Shop',
                // Grouped into 4s for display — see `bankTransferIbanFriendly`.
                iban: 'DE89 3704 0044 0532 0130 00',
                reference: stored!.transferReference
            });
        }));

    it('sends the transfer instructions email instead of the confirmation', () =>
        withBankTransferConfigured(async () => {
            mockEnqueueEmail.mockClear();
            const user = await createUser();
            const product = await createProduct();
            await cartItemSetById(user.id, String(product._id), 1);

            await orderConfirm(user.id, testCallerContext, undefined, undefined, 'bank_transfer');
            await flush();

            expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
            const [envelope, template] = mockEnqueueEmail.mock.calls[0];
            expect(envelope.to).toBe(user.email);
            expect(template).toBe('orders.order-transfer-instructions');
        }));

    it('refuses a third open transfer order past the cap', () =>
        withBankTransferConfigured(async () => {
            const user = await createUser();
            const product = await createProduct();
            // Two open transfer orders already on the books — the default cap.
            await createOrder(user, [toOrderItem(product)], {
                status: 'pending',
                paymentMethod: 'bank_transfer'
            });
            await createOrder(user, [toOrderItem(product)], {
                status: 'pending',
                paymentMethod: 'bank_transfer'
            });
            await cartItemSetById(user.id, String(product._id), 1);

            const result = await orderConfirm(
                user.id,
                testCallerContext,
                undefined,
                undefined,
                'bank_transfer'
            );

            expect(asReject(result).status).toBe(409);
            expect(asReject(result).errors[0].code).toBe('CART_BANK_TRANSFER_LIMIT');
            // Refused before anything moved — only the two pre-existing orders are on the books.
            await expect(countOrders({ userId: user._id })).resolves.toBe(2);
        }));

    it('does not count a paid transfer order against the cap', () =>
        withBankTransferConfigured(async () => {
            const user = await createUser();
            const product = await createProduct();
            await createOrder(user, [toOrderItem(product)], {
                status: 'paid',
                paymentMethod: 'bank_transfer'
            });
            await createOrder(user, [toOrderItem(product)], {
                status: 'pending',
                paymentMethod: 'bank_transfer'
            });
            await cartItemSetById(user.id, String(product._id), 1);

            const result = await orderConfirm(
                user.id,
                testCallerContext,
                undefined,
                undefined,
                'bank_transfer'
            );

            expect(result.success).toBe(true);
        }));
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

        await productRemoveFromCartsById(String(doomed._id));

        // Both carts cleaned, and the unrelated line survives — a `$pull` that matched too
        // broadly would empty the whole cart instead.
        await expect(cartGet(second.id)).resolves.toEqual([]);
        const firstItems = await cartGet(first.id);
        expect(firstItems).toHaveLength(1);
        expect(firstItems[0].productId).toBe(String(kept._id));
    });

    it('resolves without error when no cart holds the product', async () => {
        const product = await createProduct();

        await expect(productRemoveFromCartsById(String(product._id))).resolves.toBeUndefined();
    });

    /*
     * B11: a repository failure used to be caught INSIDE this function and turned into a resolved
     * `ResponseReject` — a shape nothing ever read, since this function is only ever a domain-event
     * handler (see the module docblock), never an HTTP response. `emitDomainEvent` only notices a
     * handler failing through a REJECTED promise; swallowing it here meant a genuine write failure
     * came back as `settled: true` and was never logged.
     */
    it('propagates a repository failure, so the event bus sees and logs it', async () => {
        registerModules([cartModule]);
        jest.spyOn(cartRepository, 'removeProductFromAll').mockRejectedValueOnce(
            new Error('write conflict')
        );
        const loggedError = jest.spyOn(logger, 'error').mockImplementation(() => logger);

        const settled = await emitDomainEvent(PRODUCT_DELETED, {
            productId: 'irrelevant',
            hardDelete: false
        });

        expect(settled).toBe(false);
        expect(loggedError).toHaveBeenCalledWith(
            `Domain event handler failed for "${PRODUCT_DELETED}"`,
            expect.objectContaining({ message: 'write conflict' })
        );
        resetDomainEvents();
    });
});

/**
 * Registers the real modules rather than reaching into the users service directly — the
 * `subscribe` hook reaches siblings for real, so a partial list boots handlers against modules
 * that aren't there. Also proves the subscription exists: the cart no longer hears from a direct
 * call, only from `user.deleted`, so skipping registration would pass for the wrong reason.
 */
describe('cartDeleteByUserId', () => {
    beforeEach(() => {
        registerCheckoutModules();
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('takes the cart with a hard-deleted account', async () => {
        // The cart is its own collection, reachable only through its owner — so one left behind
        // when the account is hard-deleted is unreadable forever unless this cleanup runs.
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
