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
import { wishlistRepository } from './repository';
import type { WishlistDocument } from './model';

/**
 * Wishlist Service
 *
 * The view every endpoint answers with is `{ items: [{ productId }] }` — ids only, like the
 * cart's: the client renders from its own product store, and shipping a product per line is
 * over-serialization the contract suite fails on.
 */

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
export const wishlistGet = (userId: string): Promise<WishlistView> =>
    wishlistRepository.findByUserId(userId).then((wishlist) => toWishlistView(wishlist));

/**
 * Save a product.
 *
 * The product must exist AND be publicly visible — saving a hidden or soft-deleted product from
 * a stale tab would otherwise plant a line the storefront can never render. Adding what is
 * already saved is idempotent (`$addToSet`), so a double-click answers the same 200.
 */
export const wishlistAdd = (
    userId: string,
    productId: string
): Promise<ResponseSuccess<WishlistView> | ResponseReject> =>
    productRepository.findPublicById(productId).then((product) => {
        if (!product) return generateReject(404, [t('wishlist.product-not-found')]);
        return wishlistRepository
            .addLine(userId, productId)
            .then((wishlist) =>
                generateSuccess(toWishlistView(wishlist), 200, t('wishlist.added'))
            );
    });

/**
 * Remove a saved product.
 *
 * 404 rather than silent success when the line is absent: a client deleting a line it cannot
 * see needs to know its view is stale — the same contract the cart's remove keeps.
 */
export const wishlistRemove = (
    userId: string,
    productId: string
): Promise<ResponseSuccess<WishlistView> | ResponseReject> =>
    wishlistRepository.removeLine(userId, productId).then((wishlist) => {
        if (!wishlist) return generateReject(404, [t('wishlist.not-found')]);
        return generateSuccess(toWishlistView(wishlist), 200, t('wishlist.removed'));
    });

/**
 * Move a saved product into the cart — the wishlist's exit.
 *
 * Cart first, wishlist second, deliberately in that order: if the cart write fails the line is
 * still saved (retryable, nothing lost), while the reverse order could drop the line and then
 * fail to add it — the one outcome a shopper cannot repair. The cart's own service re-validates
 * the product, so a stale line answers its 404 rather than planting a broken cart line.
 */
export const wishlistMoveToCart = (
    userId: string,
    productId: string
): Promise<ResponseSuccess<WishlistView> | ResponseReject> =>
    wishlistRepository.findByUserId(userId).then((wishlist) => {
        const saved = wishlist?.items.some((item) => String(item.productId) === productId);
        if (!saved) return generateReject(404, [t('wishlist.not-found')]);

        return cartService
            .cartItemAddById(userId, productId)
            .then(() =>
                wishlistRepository
                    .removeLine(userId, productId)
                    .then((updated) =>
                        generateSuccess(toWishlistView(updated), 200, t('wishlist.moved-to-cart'))
                    )
            );
    });

/** What a hard user deletion owes the wishlists — see `module.ts`'s subscription. */
export const wishlistDeleteByUserId = (userId: string): Promise<void> =>
    wishlistRepository.deleteByUserId(userId);

/** What a product deletion owes the wishlists — see `module.ts`'s subscription. */
export const productRemoveFromWishlistsById = (productId: string): Promise<unknown> =>
    wishlistRepository.removeProductFromAll(productId);

export const wishlistService = {
    wishlistGet,
    wishlistAdd,
    wishlistRemove,
    wishlistMoveToCart,
    wishlistDeleteByUserId,
    productRemoveFromWishlistsById
};
