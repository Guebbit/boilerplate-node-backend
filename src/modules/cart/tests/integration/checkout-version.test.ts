/**
 * @module
 * B4 — every write a shopper can make to their own cart bumps `__v`, not only checkout's own
 * clear. `services/checkout.ts` reads `__v` once and later empties the cart conditionally on that
 * read (`repository.ts`'s `clearLinesIfUnchanged`) — a write that skipped the bump would be
 * invisible to that guard, so a line added or removed mid-checkout could be silently dropped
 * instead of invalidating the race. Real Mongo throughout: the guarantee is the driver's own
 * `$inc`, which a mock can't show.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    cartItemSetById,
    cartItemAddById,
    cartItemRemoveById,
    cartRemove,
    productRemoveFromCartsById
} from '@modules/cart/services';
import { cartRepository } from '@modules/cart/repository';
import { testCallerContext } from '@tests/callers';

setupTestDb();

/** The persisted `__v` for a user's cart, or `undefined` when the cart doesn't exist yet. */
const versionOf = (userId: string): Promise<number | undefined> =>
    cartRepository.findByUserId(userId).then((cart) => cart?.__v);

describe('cart version increments on every write (B4)', () => {
    it('starts already bumped on the write that creates the cart', async () => {
        const user = await createUser();
        const product = await createProduct();

        await cartItemSetById(user.id, String(product._id), 1);

        // Not 0: the very first write is itself a race checkout can lose against, so it must
        // already be distinguishable from "no write happened yet".
        await expect(versionOf(user.id)).resolves.toBe(1);
    });

    it('bumps when a new line is pushed onto an already-existing cart', async () => {
        const user = await createUser();
        const first = await createProduct();
        const second = await createProduct();
        await cartItemSetById(user.id, String(first._id), 1);
        const before = await versionOf(user.id);

        await cartItemSetById(user.id, String(second._id), 1);

        await expect(versionOf(user.id)).resolves.toBe((before ?? 0) + 1);
    });

    it('bumps when an existing line is set to a new quantity', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);
        const before = await versionOf(user.id);

        await cartItemSetById(user.id, String(product._id), 3);

        await expect(versionOf(user.id)).resolves.toBe((before ?? 0) + 1);
    });

    it('bumps when an existing line is incremented', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);
        const before = await versionOf(user.id);

        await cartItemAddById(user.id, String(product._id), 1);

        await expect(versionOf(user.id)).resolves.toBe((before ?? 0) + 1);
    });

    it('bumps when a line is removed', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);
        const before = await versionOf(user.id);

        await cartItemRemoveById(user.id, String(product._id), testCallerContext);

        await expect(versionOf(user.id)).resolves.toBe((before ?? 0) + 1);
    });

    it('bumps when the whole cart is cleared', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);
        const before = await versionOf(user.id);

        await cartRemove(user.id, testCallerContext);

        await expect(versionOf(user.id)).resolves.toBe((before ?? 0) + 1);
    });

    it('bumps every cart a deleted product is pulled out of', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 1);
        const before = await versionOf(user.id);

        await productRemoveFromCartsById(String(product._id));

        await expect(versionOf(user.id)).resolves.toBe((before ?? 0) + 1);
    });
});
