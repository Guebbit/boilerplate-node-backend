/**
 * Cart service — `src/services/cart.ts`.
 *
 * The distinction that carries the most risk here is `set` vs `add`: `cartItemSetById` replaces a
 * line's quantity, `cartItemAddById` increments it. They share one private `upsertCartItem`
 * implementation differing by a single ternary, so a mutation that collapses them is invisible in
 * review and produces a cart that silently multiplies (or loses) what a user asked for. Several
 * tests below exist only to keep those two apart.
 *
 * The second is the over-serialization guard on `cartGetWithSummary`. `CartItem` in `openapi.yaml`
 * is `additionalProperties: false` over `{ productId, quantity }`, so the populated `product` used
 * to price the cart must be dropped before the response leaves. That has already shipped as a bug
 * once; it is asserted here as well as in the contract suite, because the contract suite only sees
 * it when a route happens to be exercised.
 *
 * Real Mongo throughout (`setupTestDb`), because most of this module's behaviour is what Mongoose
 * does with a mutated subdocument array — mocking the repository would assert the mock.
 */

import { setupTestDb } from '../../helpers/setup-test-db';
import { createUser } from '../../helpers/factories/users';
import { createProduct } from '../../helpers/factories/products';
import {
    cartGet,
    cartGetWithSummary,
    cartItemSetById,
    cartItemSet,
    cartItemAddById,
    cartItemAdd,
    cartItemRemoveById,
    cartItemRemove,
    cartRemove,
    orderConfirm,
    productRemoveFromCartsById
} from '@services/cart';
import { userRepository } from '@repositories/users';
import { orderRepository } from '@repositories/orders';
import type { IResponseReject, IResponseSuccess } from '@core/http/response';
import type { IUserCartDto } from '@services/cart.dto';

setupTestDb();

/** An id that is structurally valid but present in no collection. */
const MISSING_ID = '507f1f77bcf86cd799439011';

const asReject = (result: unknown) => result as IResponseReject;
const asCartSuccess = (result: unknown) => result as IResponseSuccess<IUserCartDto>;

/** Reads the persisted quantity for a product, so assertions survive the round trip to Mongo. */
const storedQuantity = async (userId: string, productId: string): Promise<number | undefined> => {
    const user = await userRepository.findById(userId);
    return user?.cart.items.find((item) => String(item.product) === productId)?.quantity;
};

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
});

describe('cartGetWithSummary', () => {
    it('drops the populated product from every line', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Keyboard', price: 25 });
        await cartItemSetById(user.id, String(product._id), 2);

        const { items } = await cartGetWithSummary(user.id);

        // `CartItem` is additionalProperties:false — an extra key here is a contract violation,
        // and this exact leak has shipped before.
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

        const { items, summary } = await cartGetWithSummary(user.id);

        expect(items).toEqual([]);
        expect(summary).toEqual({ itemsCount: 0, totalQuantity: 0, total: 0 });
    });
});

describe('cartItemSetById', () => {
    it('adds a line that was not in the cart', async () => {
        const user = await createUser();
        const product = await createProduct();

        const result = await cartItemSetById(user.id, String(product._id), 3);

        expect(result.success).toBe(true);
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

    it('rejects with 404 for a user that does not exist', async () => {
        const product = await createProduct();

        const result = await cartItemSetById(MISSING_ID, String(product._id), 1);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });

    it('returns the updated cart projected as a DTO', async () => {
        const user = await createUser();
        const product = await createProduct();

        const result = await cartItemSetById(user.id, String(product._id), 2);

        expect(asCartSuccess(result).data).toMatchObject({
            id: user.id,
            cart: { items: [{ productId: String(product._id), quantity: 2 }] }
        });
    });

    it('refreshes the cart timestamp', async () => {
        const user = await createUser();
        const product = await createProduct();
        const before = user.cart.updatedAt;

        await cartItemSetById(user.id, String(product._id), 1);

        const reloaded = await userRepository.findById(user.id);
        expect(reloaded!.cart.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
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

    it('rejects with 404 for a user that does not exist', async () => {
        const product = await createProduct();

        const result = await cartItemAddById(MISSING_ID, String(product._id), 1);

        expect(asReject(result).status).toBe(404);
    });
});

describe('cartItemSet / cartItemAdd (document overloads)', () => {
    it('cartItemSet behaves as cartItemSetById for the same product', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSet(user.id, product, 4);

        await cartItemSet(user.id, product, 2);

        expect(await storedQuantity(user.id, String(product._id))).toBe(2);
    });

    it('cartItemAdd behaves as cartItemAddById for the same product', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemAdd(user.id, product, 4);

        await cartItemAdd(user.id, product, 2);

        expect(await storedQuantity(user.id, String(product._id))).toBe(6);
    });
});

describe('cartItemRemoveById', () => {
    it('removes the targeted line', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 2);

        const result = await cartItemRemoveById(user.id, String(product._id));

        expect(result.success).toBe(true);
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
        const product = await createProduct();

        const result = await cartItemRemoveById(user.id, String(product._id));

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });

    it('rejects with 404 for a user that does not exist', async () => {
        const product = await createProduct();

        const result = await cartItemRemoveById(MISSING_ID, String(product._id));

        expect(asReject(result).status).toBe(404);
    });

    it('cartItemRemove behaves as cartItemRemoveById for the same product', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);

        const result = await cartItemRemove(user.id, product);

        expect(result.success).toBe(true);
        await expect(cartGet(user.id)).resolves.toEqual([]);
    });
});

describe('cartRemove', () => {
    it('clears every line', async () => {
        const user = await createUser();
        const keyboard = await createProduct({ title: 'Keyboard' });
        const mouse = await createProduct({ title: 'Mouse' });
        await cartItemSetById(user.id, String(keyboard._id), 1);
        await cartItemSetById(user.id, String(mouse._id), 2);

        const result = await cartRemove(user.id);

        expect(result.success).toBe(true);
        await expect(cartGet(user.id)).resolves.toEqual([]);
    });

    it('succeeds on an already-empty cart', async () => {
        // Idempotent by design — clearing twice must not 404.
        const user = await createUser();

        await expect(cartRemove(user.id)).resolves.toMatchObject({ success: true });
    });

    it('rejects with 404 for a user that does not exist', async () => {
        const result = await cartRemove(MISSING_ID);

        expect(asReject(result).status).toBe(404);
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

    it('rejects with 404 for a user that does not exist', async () => {
        const result = await orderConfirm(MISSING_ID);

        expect(asReject(result).status).toBe(404);
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
