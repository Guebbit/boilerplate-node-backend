/**
 * @module
 * `wishlistService` — the rules that make a wishlist safe to lean on: saving is idempotent
 * (`$addToSet`), only publicly visible products can be saved, move-to-cart writes the cart
 * BEFORE dropping the line (so a refusal leaves it "still saved", never "vanished"), and the
 * module's event subscriptions clean up after product/user deletions.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironmentOverrides } from '@tests/environment';
import { testCallerContext, callerContextAs } from '@tests/callers';
import { settleOutboxNudges } from '@kernel/outbox';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { wishlistService } from '@modules/wishlist/service';
import { wishlistRepository } from '@modules/wishlist/repository';
import { cartService } from '@modules/cart';
import { productService } from '@modules/products';
import { userService } from '@modules/users';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { observePort } from '@tests/ports';
import { wishlistAnalyticsEvents } from '../../analytics';
import { enabledModules } from '../../../../modules';

/* Replaced, not spied on — see `tests/support/ports.ts` for why. */
jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/analytics'),
    emitAnalyticsEvent: jest.fn()
}));

setupTestDb();

const savedIds = async (userId: string) => {
    const view = await wishlistService.get(userId);
    return view.items.map(({ productId }) => productId);
};

describe('wishlistRepository.addLine', () => {
    // The service fires `WISHLIST_ITEM_ADDED` off this flag, so it must say true exactly once.
    it('reports a product as added the first time only, whatever the retries', async () => {
        const user = await createUser();
        const product = await createProduct();

        const first = await wishlistRepository.addLine(user.id, String(product._id));
        const second = await wishlistRepository.addLine(user.id, String(product._id));

        expect([first.added, second.added]).toEqual([true, false]);
        expect(second.wishlist.items).toHaveLength(1);
    });
});

describe('get: availability per line', () => {
    it('names each saved product by what it can do right now', async () => {
        const user = await createUser();
        const onSale = await createProduct({ onHand: 5 });
        const soldOut = await createProduct({ onHand: 0 });
        const offSale = await createProduct({ onHand: 5, purchasable: false });
        const hidden = await createProduct({ onHand: 5 });
        for (const product of [onSale, soldOut, offSale, hidden])
            await wishlistRepository.addLine(user.id, String(product._id));
        await productService.updateById(String(hidden._id), { active: false }, testCallerContext);

        const view = await wishlistService.get(user.id);

        expect(view.items).toEqual([
            { productId: String(onSale._id), availability: 'in_stock' },
            { productId: String(soldOut._id), availability: 'out_of_stock' },
            { productId: String(offSale._id), availability: 'unavailable' },
            { productId: String(hidden._id), availability: 'removed' }
        ]);
    });

    it('never says insufficient_stock: a wishlist line holds no quantity', async () => {
        const user = await createUser();
        const scarce = await createProduct({ onHand: 1 });
        await wishlistRepository.addLine(user.id, String(scarce._id));

        const view = await wishlistService.get(user.id);

        expect(view.items[0].availability).toBe('in_stock');
    });

    it('returns a hidden line to a stock value once the product is shown again', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        await wishlistRepository.addLine(user.id, String(product._id));

        await productService.updateById(String(product._id), { active: false }, testCallerContext);
        const hidden = await wishlistService.get(user.id);
        await productService.updateById(String(product._id), { active: true }, testCallerContext);
        const shown = await wishlistService.get(user.id);

        expect([hidden.items[0].availability, shown.items[0].availability]).toEqual([
            'removed',
            'in_stock'
        ]);
    });

    it('lets an off-sale product be saved, and moves it to the cart like a sold-out one', async () => {
        const user = await createUser();
        const offSale = await createProduct({ onHand: 5, purchasable: false });

        const saved = await wishlistService.add(user.id, String(offSale._id), testCallerContext);
        const moved = await wishlistService.moveToCart(
            user.id,
            String(offSale._id),
            testCallerContext
        );

        expect(saved.success).toBe(true);
        expect(moved.success).toBe(true);
        const cart = await cartService.cartGetForBadge(user.id);
        expect(cart.items).toEqual([
            { productId: String(offSale._id), quantity: 1, availability: 'unavailable' }
        ]);
    });
});

describe('exportLines', () => {
    it('carries the saved product ids only, no availability', async () => {
        const user = await createUser();
        const product = await createProduct({ purchasable: false });
        await wishlistRepository.addLine(user.id, String(product._id));

        await expect(wishlistService.exportLines(user.id)).resolves.toEqual([
            { productId: String(product._id) }
        ]);
    });
});

describe('add', () => {
    it('saves a product and answers the view', async () => {
        const user = await createUser();
        const product = await createProduct();

        const result = await wishlistService.add(user.id, String(product._id), testCallerContext);

        expect(result.success).toBe(true);
        expect(await savedIds(user.id)).toEqual([String(product._id)]);
    });

    it('is idempotent: saving twice leaves one line', async () => {
        const user = await createUser();
        const product = await createProduct();

        await wishlistService.add(user.id, String(product._id), testCallerContext);
        const second = await wishlistService.add(user.id, String(product._id), testCallerContext);

        expect(second.success).toBe(true);
        expect(await savedIds(user.id)).toEqual([String(product._id)]);
    });

    it('announces the save once, however often the same product is saved again', async () => {
        const user = await createUser();
        const product = await createProduct();
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);

        for (let attempt = 0; attempt < 3; attempt += 1)
            await wishlistService.add(user.id, String(product._id), testCallerContext);

        const added = analyticsSpy.mock.calls.filter(
            ([event]) => event.event === wishlistAnalyticsEvents.WISHLIST_ITEM_ADDED
        );
        expect(added).toHaveLength(1);
    });

    it('refuses a soft-deleted product with 404', async () => {
        const user = await createUser();
        const gone = await createProduct({ deletedAt: new Date().toISOString() });

        const result = await wishlistService.add(user.id, String(gone._id), testCallerContext);

        expect(result.status).toBe(404);
        expect(await savedIds(user.id)).toEqual([]);
    });

    it('refuses a product outside the public catalogue with 404', async () => {
        const user = await createUser();
        const hidden = await createProduct({ active: false });

        const result = await wishlistService.add(user.id, String(hidden._id), testCallerContext);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        expect(await savedIds(user.id)).toEqual([]);
    });
});

describe('remove', () => {
    it('removes exactly the named line', async () => {
        const user = await createUser();
        const keep = await createProduct({ title: 'Keep' });
        const drop = await createProduct({ title: 'Drop' });
        await wishlistService.add(user.id, String(keep._id), testCallerContext);
        await wishlistService.add(user.id, String(drop._id), testCallerContext);

        const result = await wishlistService.remove(user.id, String(drop._id), testCallerContext);

        expect(result.success).toBe(true);
        expect(await savedIds(user.id)).toEqual([String(keep._id)]);
    });

    it('answers 404 for a line the caller does not hold', async () => {
        const user = await createUser();
        const product = await createProduct();

        const result = await wishlistService.remove(
            user.id,
            String(product._id),
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });
});

describe('moveToCart', () => {
    it('lands the product in the cart and drops the saved line', async () => {
        const user = await createUser();
        const product = await createProduct();
        await wishlistService.add(user.id, String(product._id), testCallerContext);

        const result = await wishlistService.moveToCart(
            user.id,
            String(product._id),
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect(await savedIds(user.id)).toEqual([]);
        const cart = await cartService.cartGetForBadge(user.id);
        expect(cart.items).toEqual([
            { productId: String(product._id), quantity: 1, availability: 'in_stock' }
        ]);
    });

    it('increments a line the cart already holds', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartService.cartItemAddById(user.id, String(product._id), 2);
        await wishlistService.add(user.id, String(product._id), testCallerContext);

        await wishlistService.moveToCart(user.id, String(product._id), testCallerContext);

        const cart = await cartService.cartGetForBadge(user.id);
        expect(cart.items).toEqual([
            { productId: String(product._id), quantity: 3, availability: 'in_stock' }
        ]);
    });

    it('answers 404 for a product that was never saved — and writes no cart line', async () => {
        const user = await createUser();
        const product = await createProduct();

        const result = await wishlistService.moveToCart(
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
        await wishlistService.add(user.id, String(product._id), testCallerContext);

        await productService.updateById(String(product._id), { active: false }, testCallerContext);

        const result = await wishlistService.moveToCart(
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
        await wishlistService.add(user.id, String(product._id), testCallerContext);

        await productService.removeById(String(product._id));

        await settleOutboxNudges();

        const result = await wishlistService.moveToCart(
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
     * The one cart refusal that is NOT "not found": unlike the two cases above, the cart's own
     * 422 says something the shopper needs to hear, so it passes through rather than becoming
     * this module's 404 — the product is fine, the existing cart line is just already full.
     */
    // A ceiling of one unit fills the line with a single add, whatever the shop's own default.
    it('forwards the cart 422 once the existing line is already full, instead of a 404', () =>
        withEnvironmentOverrides({ NODE_CART_LINE_MAX: '1' }, async () => {
            const user = await createUser();
            const product = await createProduct();
            await cartService.cartItemAddById(user.id, String(product._id), 1);
            await wishlistService.add(user.id, String(product._id), testCallerContext);

            const result = await wishlistService.moveToCart(
                user.id,
                String(product._id),
                testCallerContext
            );

            expect(result.success).toBe(false);
            expect(result.status).toBe(422);
            // Still saved, same as the other refusals above — nothing was lost.
            expect(await savedIds(user.id)).toEqual([String(product._id)]);
        }));
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
        await wishlistService.add(alice.id, String(doomed._id), testCallerContext);
        await wishlistService.add(alice.id, String(kept._id), testCallerContext);
        await wishlistService.add(bob.id, String(doomed._id), testCallerContext);

        await productService.removeById(String(doomed._id), true);

        await settleOutboxNudges();

        expect(await savedIds(alice.id)).toEqual([String(kept._id)]);
        expect(await savedIds(bob.id)).toEqual([]);
    });

    it('a hard-deleted user takes their wishlist with them', async () => {
        const user = await createUser();
        const product = await createProduct();
        await wishlistService.add(user.id, String(product._id), testCallerContext);

        await userService.removeById(user.id, true, callerContextAs('admin'));

        expect(await wishlistRepository.findByUserId(user.id)).toBeNull();
    });
});
