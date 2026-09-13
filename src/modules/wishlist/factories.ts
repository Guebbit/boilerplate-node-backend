/**
 * @module
 * How a wishlist row is built. Addressed by owner like the cart — `userId` is unique and no
 * wishlist id reaches the wire — so this takes no `_id` override either; see `../cart/factories`.
 * A line is a bare product id, not a full `WishlistItem`, since a wishlist answers "do I want
 * this," not "how many."
 */

import { Types } from 'mongoose';
import type { Id } from '@types';
import type { WishlistDocument } from './model';

/** What a caller may vary when building a wishlist fixture; everything else takes a schema default. */
export interface WishlistOverrides {
    /** 24-char hex of the owning user. */
    userId: Id;
    /**
     * Absent leaves the schema's `default: []` to apply. Bare ids, not `WishlistItem[]`: a line
     * has exactly one field, so wrapping happens below into the shape the schema stores.
     */
    productIds?: Id[];
}

/** A wishlist ready for `wishlistRepository.create` — `userId` required, see `../cart/factories`. */
export type WishlistFixture = Partial<WishlistDocument> & Pick<WishlistDocument, 'userId'>;

/**
 * Build a wishlist fixture from bare product ids, wrapping each into the `{ productId }` shape.
 * @param overrides - the owner and optional product ids
 * @returns a fixture ready for `wishlistRepository.create`
 */
export const makeWishlist = ({ userId, productIds }: WishlistOverrides): WishlistFixture => ({
    userId: new Types.ObjectId(userId),
    ...(productIds === undefined
        ? {}
        : {
              items: productIds.map((productId) => ({
                  productId: new Types.ObjectId(productId)
              }))
          })
});
