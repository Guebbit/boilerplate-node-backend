/**
 * @module
 * How a wishlist row is built. Addressed by owner like the cart — `userId` is unique and no
 * wishlist id reaches the wire — but pins an `_id` anyway so a rebuilt dataset diffs cleanly; see
 * `../cart/factories`. A line is a bare product id, not a full `WishlistItem`, since a wishlist
 * answers "do I want this," not "how many."
 */

import { Types } from 'mongoose';
import { identityOf, type FactoryIdentity } from '@infrastructure/persistence/factories';
import type { Id } from '@types';
import type { WishlistDocument } from './model';

/** What a caller may vary when building a wishlist fixture; everything else takes a schema default. */
export interface WishlistOverrides extends FactoryIdentity {
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
 * @param overrides - owner, optional product ids, and identity fields `identityOf` reads
 * @returns a fixture ready for `wishlistRepository.create`
 */
export const makeWishlist = ({
    userId,
    productIds,
    ...identity
}: WishlistOverrides): WishlistFixture => ({
    userId: new Types.ObjectId(userId),
    ...identityOf(identity),
    ...(productIds === undefined
        ? {}
        : {
              items: productIds.map((productId) => ({
                  productId: new Types.ObjectId(productId)
              }))
          })
});
