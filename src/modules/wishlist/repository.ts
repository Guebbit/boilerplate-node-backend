import type { UpdateWriteOpResult } from 'mongoose';
import { wishlistModel, applyWishlistTransform } from './model';
import type { WishlistDocument } from './model';
import {
    createBaseRepository,
    toObjectId,
    type BaseRepository
} from '@infrastructure/persistence/base-repository';

/**
 * Wishlist Repository
 * Standard CRUD via the base factory, plus the three writes a wishlist actually takes.
 *
 * Every one of them is keyed by `userId` — `unique` on the schema makes that a complete address —
 * so no caller ever fetches a wishlist before changing it. Unlike the cart there is no retry
 * loop: a line is `{ productId }` alone, so `$addToSet` IS the whole upsert. Two requests adding
 * the same product cannot produce two lines, because a set cannot hold the same member twice —
 * the race the cart resolves with a filtered two-step write does not exist here.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `BaseRepository` exists.
 *
 * Every method is `async` because each assembles its filter with `toObjectId`, which throws on a
 * malformed id — see `base-repository.ts` for why that decides between a 4xx and a 500.
 */
export const wishlistRepository: BaseRepository<WishlistDocument> & {
    findByUserId: (userId: string) => Promise<WishlistDocument | null>;
    addLine: (userId: string, productId: string) => Promise<WishlistDocument>;
    removeLine: (userId: string, productId: string) => Promise<WishlistDocument | null>;
    deleteByUserId: (userId: string) => Promise<void>;
    removeProductFromAll: (productId: string) => Promise<UpdateWriteOpResult>;
} = {
    ...createBaseRepository<WishlistDocument>(wishlistModel, {
        transform: applyWishlistTransform
    }),

    /**
     * Fetch a user's wishlist. `null` means they never saved anything — the same state as an
     * empty list, which is why no write path creates a placeholder document.
     */
    findByUserId: async (userId: string) =>
        wishlistModel.findOne({ userId: toObjectId(userId) }).exec(),

    /**
     * Add one product, creating the wishlist if the user has none. Idempotent by `$addToSet`:
     * saving what is already saved is the state the caller asked for, not an error.
     */
    addLine: async (userId: string, productId: string) =>
        wishlistModel
            .findOneAndUpdate(
                { userId: toObjectId(userId) },
                { $addToSet: { items: { productId: toObjectId(productId) } } },
                { upsert: true, returnDocument: 'after' }
            )
            .exec(),

    /**
     * Drop one line. Resolves `null` when the wishlist does not exist or does not hold the
     * product — the filter asks for both — which lets the service answer 404 without a second
     * query, exactly like the cart's `removeLine`.
     */
    removeLine: async (userId: string, productId: string) =>
        wishlistModel
            .findOneAndUpdate(
                { userId: toObjectId(userId), 'items.productId': toObjectId(productId) },
                { $pull: { items: { productId: toObjectId(productId) } } },
                { returnDocument: 'after' }
            )
            .exec(),

    /**
     * Delete a user's wishlist outright — what a hard account deletion owes it. An orphaned
     * wishlist would outlive the account with no way to reach it.
     */
    deleteByUserId: async (userId: string) =>
        wishlistModel
            .deleteOne({ userId: toObjectId(userId) })
            .exec()
            .then(() => {
                // explicit void return
            }),

    /**
     * Drop one product from every wishlist that holds it — what a product deletion owes them.
     */
    removeProductFromAll: async (productId: string) =>
        wishlistModel
            .updateMany(
                { 'items.productId': toObjectId(productId) },
                { $pull: { items: { productId: toObjectId(productId) } } }
            )
            .exec()
};
