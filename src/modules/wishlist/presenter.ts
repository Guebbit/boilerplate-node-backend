/**
 * @module
 * The one place a wishlist document becomes the wire shape `openapi.yaml` declares: a product
 * reference and nothing else. The client renders the rest from its own product store and reads
 * availability from the one batch read.
 */

import type { CartWarning, WishlistItem } from '@types';
import type { WishlistDocument } from './model';

/** The wishlist as `openapi.yaml` declares it: `WishlistResponse`, built rather than serialized. */
export interface WishlistView {
    items: WishlistItem[];
    /** What a move into the cart could not add; absent for every other answer. */
    warnings?: CartWarning[];
}

/** The stored product ids of a wishlist (or its absence), in saved order. */
export const savedProductIds = (wishlist: WishlistDocument | null): string[] =>
    (wishlist?.items ?? []).map(({ productId }) => String(productId));

/**
 * Turn a wishlist document (or its absence) into the response the contract declares.
 *
 * @param wishlist - the stored list, or `null` for none
 * @param warnings - what the move into the cart could not add, when this answers one
 */
export const presentWishlist = (
    wishlist: WishlistDocument | null,
    warnings?: readonly CartWarning[]
): WishlistView => ({
    items: savedProductIds(wishlist).map((productId) => ({ productId })),
    ...(warnings && warnings.length > 0 ? { warnings: [...warnings] } : {})
});
