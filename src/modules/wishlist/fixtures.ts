/**
 * @module
 * How a wishlist fixture is built.
 *
 * Like carts, a wishlist is addressed by its owner — `wishlists.userId` is unique and no wishlist id
 * reaches the wire — and, like carts, it pins an `_id` anyway so the exported dataset is byte-stable
 * across runs. See `../cart/fixtures` for why that is a determinism requirement rather than a new
 * handle.
 *
 * A saved line is a product id and nothing else — a wishlist answers "do I want this", not "how
 * many" — so this takes ids where the cart builder takes lines.
 */

import { Types } from 'mongoose';
import { identityOf, type FactoryIdentity } from '@infrastructure/persistence/fixtures';
import type { Id } from '@types';
import type { WishlistDocument } from './model';

export interface WishlistOverrides extends FactoryIdentity {
    /** 24-char hex of the owning user. */
    userId: Id;
    /**
     * Absent leaves the schema's `default: []` to apply.
     *
     * Ids rather than the contract's `WishlistItem[]`, and that is not a restatement of it: a saved
     * line has exactly one field, so wrapping each id in an object at the call site would be
     * ceremony. The wrapping happens below, into the shape the schema stores.
     */
    productIds?: Id[];
}

/** A wishlist ready for `wishlistRepository.create` — `userId` required, see `../cart/fixtures`. */
export type WishlistFixture = Partial<WishlistDocument> & Pick<WishlistDocument, 'userId'>;

/**
 * Build a wishlist fixture from bare product ids, wrapping each into the `{ productId }` line
 * shape the schema stores.
 *
 * @param overrides - the owner, optional product ids, and the identity fields `identityOf` reads
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
