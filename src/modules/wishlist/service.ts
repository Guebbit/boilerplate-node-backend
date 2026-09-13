/**
 * @module
 * The view every endpoint answers with is `{ items: [{ productId }] }` — ids only, like the
 * cart's: the client renders from its own product store, and shipping a product per line is
 * over-serialization the contract suite fails on.
 *
 * See: docs/modules/wishlist.md
 */

import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { productRepository } from '@modules/products';
import { cartService } from '@modules/cart';
import type { WishlistItem } from '@types';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { wishlistAnalyticsEvents } from './analytics';
import { wishlistRepository } from './repository';
import type { WishlistDocument } from './model';

/** The wishlist as `openapi.yaml` declares it: `WishlistResponse`, built rather than serialized. */
export interface WishlistView {
    items: WishlistItem[];
}

/** Turn a wishlist document (or its absence) into the response the contract declares. */
const toWishlistView = (wishlist: WishlistDocument | null): WishlistView => ({
    items: (wishlist?.items ?? []).map(({ productId }) => ({ productId: String(productId) }))
});

/**
 * Get the user's wishlist. Absence and emptiness are the same state — an empty view, never 404.
 */
const wishlistGet = (userId: string): Promise<WishlistView> =>
    wishlistRepository.findByUserId(userId).then((wishlist) => toWishlistView(wishlist));

/**
 * Save a product.
 *
 * The product must exist AND be publicly visible — saving a hidden or soft-deleted product from
 * a stale tab would otherwise plant a line the storefront can never render. Adding what is
 * already saved is idempotent (`$addToSet`), so a double-click answers the same 200.
 */
const wishlistAdd = (
    userId: string,
    productId: string,
    context: CallerContext
): Promise<ResponseSuccess<WishlistView> | ResponseReject> =>
    productRepository.findPublicById(productId).then((product) => {
        if (!product) return generateReject(404, [t('wishlist.product-not-found')]);
        return wishlistRepository.addLine(userId, productId).then((wishlist) => {
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                event: wishlistAnalyticsEvents.WISHLIST_ITEM_ADDED,
                properties: { product_id: productId }
            });
            return generateSuccess(toWishlistView(wishlist), 200, t('wishlist.added'));
        });
    });

/**
 * Remove a saved product.
 *
 * 404 rather than silent success when the line is absent: a client deleting a line it cannot
 * see needs to know its view is stale — the same contract the cart's remove keeps.
 */
const wishlistRemove = (
    userId: string,
    productId: string,
    context: CallerContext
): Promise<ResponseSuccess<WishlistView> | ResponseReject> =>
    wishlistRepository.removeLine(userId, productId).then((wishlist) => {
        if (!wishlist) return generateReject(404, [t('wishlist.not-found')]);
        emitAnalyticsEvent({
            ...buildAnalyticsBase(context),
            event: wishlistAnalyticsEvents.WISHLIST_ITEM_REMOVED,
            properties: { product_id: productId }
        });
        return generateSuccess(toWishlistView(wishlist), 200, t('wishlist.removed'));
    });

/**
 * Move a saved product into the cart — the wishlist's exit.
 *
 * Two questions, then two writes, and only the FIRST question is this module's.
 *
 * Whether the product may go in a cart is the cart's rule and is asked by asking the cart: a
 * refusal comes back as a reject envelope and becomes this operation's 404. A wishlist outlives
 * the catalogue by design — `PRODUCT_DELETED` clears hard deletions, so a line pointing at a
 * merely deactivated product is the state that survives — and re-deriving "is it still on sale"
 * here would be a second copy of a rule the cart already enforces for every other caller.
 *
 * Cart first, wishlist second, deliberately in that order: if the cart write fails the line is
 * still saved (retryable, nothing lost), while the reverse order could drop the line and then
 * fail to add it — the one outcome a shopper cannot repair.
 */
const wishlistMoveToCart = (
    userId: string,
    productId: string,
    context: CallerContext
): Promise<ResponseSuccess<WishlistView> | ResponseReject> =>
    wishlistRepository.findByUserId(userId).then((wishlist) => {
        const saved = wishlist?.items.some((item) => String(item.productId) === productId);
        if (!saved) return generateReject(404, [t('wishlist.not-found')]);

        return cartService.cartItemAddById(userId, productId).then((added) => {
            // The line stays saved. A product can come back, and a refusal to buy it now is not a
            // reason to throw away the fact that somebody wants it.
            if (!added.success) return generateReject(404, [t('wishlist.product-not-found')]);

            return wishlistRepository.removeLine(userId, productId).then((updated) => {
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    event: wishlistAnalyticsEvents.WISHLIST_MOVED_TO_CART,
                    properties: { product_id: productId }
                });
                return generateSuccess(toWishlistView(updated), 200, t('wishlist.moved-to-cart'));
            });
        });
    });

/** What a hard user deletion owes the wishlists — see `module.ts`'s subscription. */
export const wishlistDeleteByUserId = (userId: string): Promise<void> =>
    wishlistRepository.deleteByUserId(userId);

/** What a product deletion owes the wishlists — see `module.ts`'s subscription. */
export const productRemoveFromWishlistsById = (productId: string): Promise<unknown> =>
    wishlistRepository.removeProductFromAll(productId);

/** The module's barrel export — the controllers call through this, never the bare functions. */
export const wishlistService = {
    wishlistGet,
    wishlistAdd,
    wishlistRemove,
    wishlistMoveToCart,
    wishlistDeleteByUserId,
    productRemoveFromWishlistsById
};
