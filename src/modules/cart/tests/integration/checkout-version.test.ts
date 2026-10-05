/**
 * @module
 * Every write a shopper can make to their own cart bumps `__v`, not only checkout's own
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
import { advanceDate, freezeDate } from '@tests/clock';

setupTestDb();

/** The persisted `__v` for a user's cart, or `undefined` when the cart doesn't exist yet. */
const versionOf = (userId: string): Promise<number | undefined> =>
    cartRepository.findByUserId(userId).then((cart) => cart?.__v);

describe('cart version increments on every write that changes it', () => {
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

    /*
     * The one write that must NOT bump: setting a line to the quantity it already holds. A PUT
     * repeated mid-checkout would otherwise fail that checkout with CART_CHANGED over nothing.
     */
    it('does not bump when a line is set to the quantity it already holds', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemSetById(user.id, String(product._id), 2);
        const before = await versionOf(user.id);

        const result = await cartItemSetById(user.id, String(product._id), 2);

        expect(result.success).toBe(true);
        await expect(versionOf(user.id)).resolves.toBe(before);
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

        await productRemoveFromCartsById(String(product._id), {});

        await expect(versionOf(user.id)).resolves.toBe((before ?? 0) + 1);
    });
});

/** A cart with one line and a shipping choice, and the version it stands at. */
const cartWithChoice = async () => {
    const user = await createUser();
    const product = await createProduct();
    await cartItemSetById(user.id, String(product._id), 2);
    await cartRepository.setShippingMethod(user.id, 'pickup');
    return { user, product, version: (await versionOf(user.id)) ?? -1 };
};

describe('clearLinesIfUnchanged', () => {
    // The timestamp case freezes `Date`; a failed assertion must not leave it frozen.
    afterEach(() => {
        jest.useRealTimers();
    });

    it('empties the cart and its shipping choice when the version still matches', async () => {
        const { user, version } = await cartWithChoice();

        const cleared = await cartRepository.clearLinesIfUnchanged(user.id, version);

        expect(cleared?.items).toHaveLength(0);
        const stored = await cartRepository.findByUserId(user.id);
        expect(stored?.items).toHaveLength(0);
        // The choice was for the basket just bought; the next basket must not inherit it.
        expect(stored?.shippingMethodId).toBeUndefined();
        expect(stored?.__v).toBe(version + 1);
    });

    it('touches nothing when the cart moved since the version was read', async () => {
        const { user, product, version } = await cartWithChoice();
        await cartItemSetById(user.id, String(product._id), 5);
        const before = await cartRepository.findByUserId(user.id);

        const cleared = await cartRepository.clearLinesIfUnchanged(user.id, version);

        expect(cleared).toBeNull();
        const after = await cartRepository.findByUserId(user.id);
        expect(after?.items.map((item) => item.quantity)).toEqual([5]);
        expect(after?.shippingMethodId).toBe('pickup');
        expect(after?.__v).toBe(before?.__v);
    });

    it('matches at most once per version: a replay of the same read loses', async () => {
        const { user, version } = await cartWithChoice();

        await cartRepository.clearLinesIfUnchanged(user.id, version);
        const replay = await cartRepository.clearLinesIfUnchanged(user.id, version);

        expect(replay).toBeNull();
    });

    it('does not let a cart emptied and refilled match an older read', async () => {
        const { user, product, version } = await cartWithChoice();
        await cartRepository.clearLines(user.id);
        await cartItemSetById(user.id, String(product._id), 2);

        const cleared = await cartRepository.clearLinesIfUnchanged(user.id, version);

        expect(cleared).toBeNull();
        const after = await cartRepository.findByUserId(user.id);
        expect(after?.items).toHaveLength(1);
    });

    it('does not make a cart read as recently edited by the checkout that emptied it', async () => {
        const { user, version } = await cartWithChoice();
        const before = await cartRepository.findByUserId(user.id);
        // A later instant, so a clear that DID stamp the cart would show.
        freezeDate();
        advanceDate(60_000);

        await cartRepository.clearLinesIfUnchanged(user.id, version);

        const after = await cartRepository.findByUserId(user.id);
        expect(before?.updatedAt).toBeInstanceOf(Date);
        expect(after?.updatedAt?.getTime()).toBe(before?.updatedAt?.getTime());
    });

    it('answers null, and creates nothing, for a user with no cart', async () => {
        const user = await createUser();

        await expect(cartRepository.clearLinesIfUnchanged(user.id, 0)).resolves.toBeNull();
        await expect(cartRepository.findByUserId(user.id)).resolves.toBeNull();
    });
});
