/**
 * @module
 * Wishlist repository — the repository factory's standard CRUD, plus the three writes a wishlist
 * actually takes: add a line, remove a line, and the two cleanup writes owed to product and user
 * deletion.
 *
 * See: docs/modules/wishlist.md
 */

import type { UpdateWriteOpResult } from 'mongoose';
import { wishlistModel, applyWishlistTransform } from './model';
import type { WishlistDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';

/**
 * Every one of them is keyed by `userId` — `unique` on the schema makes that a complete address —
 * so no caller ever fetches a wishlist before changing it. Unlike the cart there is no retry
 * loop, and two independent facts are what excuse it — see {@link wishlistRepository.addLine},
 * which is the write both of them are about.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `Repository` exists.
 *
 * Every method is `async` because each assembles its filter with `toObjectId`, which throws on a
 * malformed id — see `create-repository.ts` for why that decides between a 4xx and a 500.
 */
export const wishlistRepository: Repository<WishlistDocument> & {
    findByUserId: (userId: string) => Promise<WishlistDocument | null>;
    addLine: (userId: string, productId: string) => Promise<WishlistDocument>;
    removeLine: (userId: string, productId: string) => Promise<WishlistDocument | null>;
    deleteByUserId: (userId: string) => Promise<void>;
    removeProductFromAll: (productId: string) => Promise<UpdateWriteOpResult>;
} = {
    ...createRepository<WishlistDocument>(wishlistModel, {
        transform: applyWishlistTransform
    }),

    /**
     * Fetch a user's wishlist. `null` means they never saved anything — the same state as an
     * empty list, which is why no write path creates a placeholder document.
     */
    findByUserId: async (userId: string) =>
        wishlistModel.findOne({ userId: toObjectId(userId) }).exec(),

    /**
     * Add one product, creating the wishlist if the user has none.
     *
     * Two races, and neither needs the retry budget `../cart/repository`'s `upsertLine` carries.
     *
     * The LINE: `$addToSet` settles it outright — a set cannot hold the same member twice, so no
     * interleaving of saves puts one product on two lines, and saving what is already saved is
     * the state the caller asked for rather than an error.
     *
     * The DOCUMENT: the filter is an exact equality on `userId`, which is the unique index's own
     * key, and that is the shape mongod resolves atomically — the upsert cannot lose to itself
     * and no E11000 reaches here. The cart's second step filters on
     * `{ userId, 'items.productId': { $ne } }`, which is NOT an exact match on its unique key, so
     * two of them can both conclude "absent" and one loses; that difference is the whole reason
     * one write retries and this one does not. Measured at 25-way contention:
     * `tests/integration/concurrency/wishlist-races.test.ts` is the case that would go red if the
     * filter ever stopped being an equality.
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
