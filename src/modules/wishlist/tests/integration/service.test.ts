/**
 * @module
 * `wishlistService` — the rules that make a wishlist safe to lean on:
 *
 *   - saving is idempotent (`$addToSet`), so no interleaving of double-clicks produces two lines;
 *   - only publicly visible products can be saved, the same gate the catalogue itself applies;
 *   - move-to-cart writes the cart BEFORE dropping the line, so the failure mode is "still
 *     saved", never "vanished" — including when the cart REFUSES the product;
 *   - the module's event subscriptions clean up after product and user deletions.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { createUser } from '@modules/users/tests/fixtures';
import { createProduct } from '@modules/products/tests/fixtures';
import { wishlistService } from '@modules/wishlist/service';
import { wishlistRepository } from '@modules/wishlist/repository';
import { cartService } from '@modules/cart';
import { productService } from '@modules/products';
import { userService } from '@modules/users';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { enabledModules } from '../../../../modules';

setupTestDb();

const savedIds = async (userId: string) => {
    const view = await wishlistService.wishlistGet(userId);
    return view.items.map(({ productId }) => productId);
};

describe('wishlistAdd', () => {
    it('saves a product and answers the view', async () => {
        const user = await createUser();
        const product = await createProduct();

        const result = await wishlistService.wishlistAdd(
            user.id,
            String(product._id),
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect(await savedIds(user.id)).toEqual([String(product._id)]);
    });

    it('is idempotent: saving twice leaves one line', async () => {
        const user = await createUser();
        const product = await createProduct();

        await wishlistService.wishlistAdd(user.id, String(product._id), testCallerContext);
        const second = await wishlistService.wishlistAdd(
            user.id,
            String(product._id),
            testCallerContext
        );

        expect(second.success).toBe(true);
        expect(await savedIds(user.id)).toEqual([String(product._id)]);
    });

    it('refuses a product outside the public catalogue with 404', async () => {
        const user = await createUser();
        const hidden = await createProduct({ active: false });

        const result = await wishlistService.wishlistAdd(
            user.id,
            String(hidden._id),
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        expect(await savedIds(user.id)).toEqual([]);
    });
});

describe('wishlistRemove', () => {
    it('removes exactly the named line', async () => {
        const user = await createUser();
        const keep = await createProduct({ title: 'Keep' });
        const drop = await createProduct({ title: 'Drop' });
        await wishlistService.wishlistAdd(user.id, String(keep._id), testCallerContext);
        await wishlistService.wishlistAdd(user.id, String(drop._id), testCallerContext);

        const result = await wishlistService.wishlistRemove(
            user.id,
            String(drop._id),
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect(await savedIds(user.id)).toEqual([String(keep._id)]);
    });

    it('answers 404 for a line the caller does not hold', async () => {
        const user = await createUser();
        const product = await createProduct();

        const result = await wishlistService.wishlistRemove(
            user.id,
            String(product._id),
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });
});

describe('wishlistMoveToCart', () => {
    it('lands the product in the cart and drops the saved line', async () => {
        const user = await createUser();
        const product = await createProduct();
        await wishlistService.wishlistAdd(user.id, String(product._id), testCallerContext);

        const result = await wishlistService.wishlistMoveToCart(
            user.id,
            String(product._id),
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect(await savedIds(user.id)).toEqual([]);
        const cart = await cartService.cartGetForBadge(user.id);
        expect(cart.items).toEqual([{ productId: String(product._id), quantity: 1 }]);
    });

    it('increments a line the cart already holds', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartService.cartItemAddById(user.id, String(product._id), 2);
        await wishlistService.wishlistAdd(user.id, String(product._id), testCallerContext);

        await wishlistService.wishlistMoveToCart(user.id, String(product._id), testCallerContext);

        const cart = await cartService.cartGetForBadge(user.id);
        expect(cart.items).toEqual([{ productId: String(product._id), quantity: 3 }]);
    });

    it('answers 404 for a product that was never saved — and writes no cart line', async () => {
        const user = await createUser();
        const product = await createProduct();

        const result = await wishlistService.wishlistMoveToCart(
            user.id,
            String(product._id),
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        const cart = await cartService.cartGetForBadge(user.id);
        expect(cart.items).toEqual([]);
    });

    /*
     * The catalogue gate, reached THROUGH the cart. `cartItemAddById` refuses a product the
     * storefront would not show, and this module turns that refusal into its own 404 rather than
     * asking the catalogue a second time — so these two cases fail if either half breaks: the
     * cart's rule, or this module's reading of it.
     *
     * Withdrawal is the interesting shape, not deletion: `PRODUCT_DELETED` clears hard deletions
     * out of every wishlist, so a saved line pointing at a hidden product is the state that
     * actually survives.
     */
    it('answers 404 once the product leaves the public catalogue, and writes no cart line', async () => {
        const user = await createUser();
        const product = await createProduct();
        await wishlistService.wishlistAdd(user.id, String(product._id), testCallerContext);

        await productService.updateById(String(product._id), { active: false }, testCallerContext);

        const result = await wishlistService.wishlistMoveToCart(
            user.id,
            String(product._id),
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        const cart = await cartService.cartGetForBadge(user.id);
        expect(cart.items).toEqual([]);
        // Still saved. The refusal is about buying it now, not about forgetting it — a product
        // can come back, and dropping the line would take the shopper's list with it.
        expect(await savedIds(user.id)).toEqual([String(product._id)]);
    });

    it('answers 404 once the product is soft-deleted, and writes no cart line', async () => {
        const user = await createUser();
        const product = await createProduct();
        await wishlistService.wishlistAdd(user.id, String(product._id), testCallerContext);

        await productService.removeById(String(product._id));

        const result = await wishlistService.wishlistMoveToCart(
            user.id,
            String(product._id),
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        const cart = await cartService.cartGetForBadge(user.id);
        expect(cart.items).toEqual([]);
    });
});

describe('the module subscriptions', () => {
    beforeEach(() => {
        resetDomainEvents();
        registerModules(enabledModules);
    });

    it('a hard-deleted product leaves every wishlist', async () => {
        const alice = await createUser({ email: 'alice@example.com', username: 'alice' });
        const bob = await createUser({ email: 'bob@example.com', username: 'bob' });
        const doomed = await createProduct({ title: 'Doomed' });
        const kept = await createProduct({ title: 'Kept' });
        await wishlistService.wishlistAdd(alice.id, String(doomed._id), testCallerContext);
        await wishlistService.wishlistAdd(alice.id, String(kept._id), testCallerContext);
        await wishlistService.wishlistAdd(bob.id, String(doomed._id), testCallerContext);

        await productService.removeById(String(doomed._id), true);

        expect(await savedIds(alice.id)).toEqual([String(kept._id)]);
        expect(await savedIds(bob.id)).toEqual([]);
    });

    it('a hard-deleted user takes their wishlist with them', async () => {
        const user = await createUser();
        const product = await createProduct();
        await wishlistService.wishlistAdd(user.id, String(product._id), testCallerContext);

        await userService.removeById(user.id, true);

        expect(await wishlistRepository.findByUserId(user.id)).toBeNull();
    });
});
