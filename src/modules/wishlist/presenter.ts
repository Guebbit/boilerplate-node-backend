/**
 * @module
 * The one place a wishlist document becomes the wire shape `openapi.yaml` declares — ids only,
 * like the cart's: the client renders from its own product store.
 */

import type { WishlistItem } from '@types';
import type { WishlistDocument } from './model';

/** The wishlist as `openapi.yaml` declares it: `WishlistResponse`, built rather than serialized. */
export interface WishlistView {
    items: WishlistItem[];
}

/** Turn a wishlist document (or its absence) into the response the contract declares. */
export const presentWishlist = (wishlist: WishlistDocument | null): WishlistView => ({
    items: (wishlist?.items ?? []).map(({ productId }) => ({ productId: String(productId) }))
});
