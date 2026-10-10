/**
 * @module
 * The one place a wishlist document becomes the wire shape `openapi.yaml` declares: a product
 * reference and what that product can do right now. The client renders the rest from its own
 * product store.
 */

import type { LineAvailability, WishlistItem } from '@types';
import type { WishlistDocument } from './model';

/** The wishlist as `openapi.yaml` declares it: `WishlistResponse`, built rather than serialized. */
export interface WishlistView {
    items: WishlistItem[];
}

/** The stored product ids of a wishlist (or its absence), in saved order. */
export const savedProductIds = (wishlist: WishlistDocument | null): string[] =>
    (wishlist?.items ?? []).map(({ productId }) => String(productId));

/**
 * Turn a wishlist document (or its absence) into the response the contract declares.
 *
 * @param wishlist - the stored list, or `null` for none
 * @param availability - each saved product's availability; a product it has no entry for reads `removed`
 */
export const presentWishlist = (
    wishlist: WishlistDocument | null,
    availability: ReadonlyMap<string, LineAvailability>
): WishlistView => ({
    items: savedProductIds(wishlist).map((productId) => ({
        productId,
        availability: availability.get(productId) ?? 'removed'
    }))
});
