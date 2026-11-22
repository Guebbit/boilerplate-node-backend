/**
 * @module
 * `wishlistService` — the rules that make a wishlist safe to lean on: saving is idempotent
 * (`$addToSet`), only publicly visible products can be saved, move-to-cart writes the cart
 * BEFORE dropping the line (so a refusal leaves it "still saved", never "vanished"), and the
 * module's event subscriptions clean up after product/user deletions.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironmentOverrides } from '@tests/environment';
import { asReject, asSuccess } from '@tests/response';
import { testCallerContext, callerContextAs } from '@tests/callers';
import { settleOutboxNudges } from '@kernel/outbox';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { wishlistService } from '@modules/wishlist/service';
import { wishlistRepository, WISHLIST_LIMIT_REACHED } from '@modules/wishlist/repository';
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

/** The product ids saved on the user's wishlist. */
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

        if (first === WISHLIST_LIMIT_REACHED || second === WISHLIST_LIMIT_REACHED)
            throw new Error('expected room in the list');
        expect([first.added, second.added]).toEqual([true, false]);
        expect(second.wishlist.items).toHaveLength(1);
    });
});

describe('get: ids only', () => {
    it('answers each saved product as its id and nothing else, whatever state the product is in', async () => {
        const user = await createUser();
        const onSale = await createProduct({ onHand: 5 });
        const soldOut = await createProduct({ onHand: 0 });
        const offSale = await createProduct({ onHand: 5, purchasable: false });
        const hidden = await createProduct({ onHand: 5 });
        for (const product of [onSale, soldOut, offSale, hidden])
            await wishlistRepository.addLine(user.id, String(product._id));
        await productService.updateById(String(hidden._id), { active: false }, testCallerContext);

        const view = await wishlistService.get(user.id);

        // What each product can do is the availability read's answer, asked once for the list.
        expect(view).toEqual({
            items: [onSale, soldOut, offSale, hidden].map((product) => ({
                productId: String(product._id)
            }))
        });
    });

    it('lets an off-sale product be saved, and keeps it saved when the move adds nothing', async () => {
        const user = await createUser();
        const offSale = await createProduct({ onHand: 5, purchasable: false });

        const saved = await wishlistService.add(user.id, String(offSale._id), testCallerContext);
        const moved = await wishlistService.moveToCart(
            user.id,
            String(offSale._id),
            testCallerContext
        );

        expect(saved.success).toBe(true);
        // Nothing can be bought of it: the answer is the wishlist, still holding the line, and why.
        expect(moved.success && moved.data).toEqual({
            items: [{ productId: String(offSale._id) }],
            warnings: [
                {
                    code: 'MERCHANDISE_OUT_OF_STOCK',
                    productId: String(offSale._id),
                    requested: 1,
                    resulting: 0
                }
            ]
        });
        const { items } = await cartService.getForBadge(user.id);
        expect(items).toEqual([]);
        expect(await savedIds(user.id)).toEqual([String(offSale._id)]);
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

/** Run `body` with the cap at 3, so a case does not save two hundred and fifty products. */
const withCap = (body: () => Promise<void>) =>
    withEnvironmentOverrides({ NODE_WISHLIST_MAX: '3' }, body);

/** Save `count` fresh products for `userId`; resolves their ids in save order. */
const saveProducts = async (userId: string, count: number) => {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
        const product = await createProduct();
        ids.push(String(product._id));
        await wishlistService.add(userId, String(product._id), testCallerContext);
    }
    return ids;
};

/**
 * `GET /wishlist` is never paginated, so the list is bounded where a product is saved. The cap is
 * in the write's own update, so it holds under concurrency too.
 */
describe('the wishlist cap', () => {
    it('refuses a new product past the cap with a 409, and saves nothing', () =>
        withCap(async () => {
            const user = await createUser();
            const held = await saveProducts(user.id, 3);
            const extra = await createProduct();

            const result = await wishlistService.add(user.id, String(extra._id), testCallerContext);

            expect(asReject(result).status).toBe(409);
            expect(asReject(result).errors[0].code).toBe('WISHLIST_LIMIT_REACHED');
            expect(await savedIds(user.id)).toEqual(held);
        }));

    it('answers 200 for a product already saved, even at the cap', () =>
        withCap(async () => {
            const user = await createUser();
            const held = await saveProducts(user.id, 3);

            const result = await wishlistService.add(user.id, held[0], testCallerContext);

            expect(asSuccess(result).status).toBe(200);
            expect(await savedIds(user.id)).toEqual(held);
        }));

    it('lets a product in again once one is removed', () =>
        withCap(async () => {
            const user = await createUser();
            const held = await saveProducts(user.id, 3);
            await wishlistService.remove(user.id, held[0], testCallerContext);
            const extra = await createProduct();

            const result = await wishlistService.add(user.id, String(extra._id), testCallerContext);

            expect(asSuccess(result).status).toBe(200);
            expect(await savedIds(user.id)).toEqual([held[1], held[2], String(extra._id)]);
        }));

    it('never lets a burst of saves past the cap', () =>
        withCap(async () => {
            const user = await createUser();
            const products = await Promise.all(Array.from({ length: 8 }, () => createProduct()));

            await Promise.all(
                products.map(({ _id }) =>
                    wishlistService.add(user.id, String(_id), testCallerContext)
                )
            );

            expect(await savedIds(user.id)).toHaveLength(3);
        }));
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
        const cart = await cartService.getForBadge(user.id);
        expect(cart.items).toEqual([
            {
                productId: String(product._id),
                quantity: 1,
                availability: 'in_stock',
                quantityAvailable: 10,
                canIncrease: true
            }
        ]);
    });

    it('moves an uncapped backorder product: no limit is not nothing', async () => {
        const user = await createUser();
        const product = await createProduct({
            onHand: 0,
            allowBackorder: true,
            backorderLimit: null
        });
        await wishlistService.add(user.id, String(product._id), testCallerContext);

        const result = await wishlistService.moveToCart(
            user.id,
            String(product._id),
            testCallerContext
        );

        expect(result.success && result.data.warnings).toBeUndefined();
        expect(await savedIds(user.id)).toEqual([]);
        const { items } = await cartService.getForBadge(user.id);
        expect(items[0]?.quantity).toBe(1);
    });

    it('keeps the line saved, with a warning, when the cart already holds all that can be bought', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 2 });
        await cartService.addItemById(user.id, String(product._id), 2);
        await wishlistService.add(user.id, String(product._id), testCallerContext);

        const result = await wishlistService.moveToCart(
            user.id,
            String(product._id),
            testCallerContext
        );

        expect(result.success && result.data.warnings).toEqual([
            {
                code: 'MERCHANDISE_NOT_ENOUGH_STOCK',
                productId: String(product._id),
                requested: 3,
                resulting: 2
            }
        ]);
        expect(await savedIds(user.id)).toEqual([String(product._id)]);
        const { items } = await cartService.getForBadge(user.id);
        expect(items[0]?.quantity).toBe(2);
    });

    it('increments a line the cart already holds', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartService.addItemById(user.id, String(product._id), 2);
        await wishlistService.add(user.id, String(product._id), testCallerContext);

        await wishlistService.moveToCart(user.id, String(product._id), testCallerContext);

        const cart = await cartService.getForBadge(user.id);
        expect(cart.items).toEqual([
            {
                productId: String(product._id),
                quantity: 3,
                availability: 'in_stock',
                quantityAvailable: 10,
                canIncrease: true
            }
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
        const cart = await cartService.getForBadge(user.id);
        expect(cart.items).toEqual([]);
    });

    /**
     * The catalogue gate, reached THROUGH the cart. `addItemById` refuses a product the
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
        const cart = await cartService.getForBadge(user.id);
        expect(cart.items).toEqual([]);
        /**
         * Still saved. The refusal is about buying it now, not about forgetting it — a product
         * can come back, and dropping the line would take the shopper's list with it.
         */
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
        const cart = await cartService.getForBadge(user.id);
        expect(cart.items).toEqual([]);
    });

    /**
     * The one cart refusal that is NOT "not found": unlike the two cases above, the cart's own
     * 422 says something the shopper needs to hear, so it passes through rather than becoming
     * this module's 404 — the product is fine, the existing cart line is just already full.
     */
    // A ceiling of one unit fills the line with a single add, whatever the shop's own default.
    it('forwards the cart 422 once the existing line is already full, instead of a 404', () =>
        withEnvironmentOverrides({ NODE_CART_LINE_MAX_QUANTITY: '1' }, async () => {
            const user = await createUser();
            const product = await createProduct();
            await cartService.addItemById(user.id, String(product._id), 1);
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

describe('moveToCart into a full cart', () => {
    it('answers the cart 409 and keeps the product saved', () =>
        withEnvironmentOverrides({ NODE_CART_MAX_LINES: '1' }, async () => {
            const user = await createUser();
            const inCart = await createProduct();
            const saved = await createProduct();
            await cartService.addItemById(user.id, String(inCart._id), 1);
            await wishlistService.add(user.id, String(saved._id), testCallerContext);

            const result = await wishlistService.moveToCart(
                user.id,
                String(saved._id),
                testCallerContext
            );

            expect(asReject(result).status).toBe(409);
            expect(asReject(result).errors[0].code).toBe('CART_LINE_LIMIT_REACHED');
            expect(await savedIds(user.id)).toEqual([String(saved._id)]);
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
