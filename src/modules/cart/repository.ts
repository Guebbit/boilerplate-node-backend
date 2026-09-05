/**
 * @module
 * Cart repository — the repository factory's standard CRUD, plus the six writes a cart actually
 * takes: upsert a line, remove a line, clear all lines (plain and version-guarded for checkout),
 * and the two cleanup writes owed to product and user deletion.
 *
 * See: docs/modules/cart.md
 */

import type { UpdateWriteOpResult } from 'mongoose';
import { cartModel, applyCartTransform } from './model';
import type { CartDocument } from './model';
import { isDuplicateKey } from '@infrastructure/http/errors';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';

/** How {@link upsertLine} treats a quantity for a line already in the cart. */
export type CartLineMode = 'set' | 'add';

/**
 * Set or increment one cart line, creating the cart if the user has none.
 *
 * CONCURRENCY. Each write's condition lives IN THE FILTER, not a preceding read, so mongod
 * evaluates it while holding the document — two requests adding the same product cannot both
 * conclude "absent" and both append. The loser instead hits the unique `userId` index (a second
 * cart insert, or a duplicate line), so a duplicate key is retried rather than surfaced, per
 * MongoDB's own guidance for a contended upsert — it converges next pass. `attemptsLeft` only
 * bounds a pathological loop.
 */
const upsertLine = (
    userId: string,
    productId: string,
    quantity: number,
    mode: CartLineMode,
    attemptsLeft = 3
): Promise<CartDocument> => {
    const owner = { userId: toObjectId(userId) };
    const line = toObjectId(productId);

    return cartModel
        .findOneAndUpdate(
            { ...owner, 'items.productId': line },
            mode === 'set'
                ? { $set: { 'items.$.quantity': quantity } }
                : { $inc: { 'items.$.quantity': quantity } },
            { returnDocument: 'after' }
        )
        .exec()
        .then(
            (cart) =>
                cart ??
                cartModel
                    .findOneAndUpdate(
                        { ...owner, 'items.productId': { $ne: line } },
                        { $push: { items: { productId: line, quantity } } },
                        { upsert: true, returnDocument: 'after' }
                    )
                    .exec()
        )
        .catch((error: unknown) => {
            if (attemptsLeft <= 1 || !isDuplicateKey(error)) throw error;
            return upsertLine(userId, productId, quantity, mode, attemptsLeft - 1);
        });
};

/**
 * Cart Repository
 * Standard CRUD via the repository factory, plus the writes a cart actually takes — each keyed
 * by `userId` alone, since `unique: true` on the schema makes that a complete address. Written
 * out explicitly: Mongoose's generics are too large for TS to infer at this export boundary (TS7056).
 */
export const cartRepository: Repository<CartDocument> & {
    findByUserId: (userId: string) => Promise<CartDocument | null>;
    upsertLine: (
        userId: string,
        productId: string,
        quantity: number,
        mode: CartLineMode
    ) => Promise<CartDocument>;
    removeLine: (userId: string, productId: string) => Promise<CartDocument | null>;
    clearLines: (userId: string) => Promise<CartDocument | null>;
    clearLinesIfUnchanged: (userId: string, version: number) => Promise<CartDocument | null>;
    deleteByUserId: (userId: string) => Promise<void>;
    removeProductFromAll: (productId: string) => Promise<UpdateWriteOpResult>;
} = {
    ...createRepository<CartDocument>(cartModel, {
        transform: applyCartTransform
    }),

    /**
     * Fetch a user's cart. `null` means the user has never added anything — the same state as an
     * empty cart, which is why no write path creates a placeholder document.
     */
    findByUserId: (userId: string) => cartModel.findOne({ userId: toObjectId(userId) }).exec(),

    /** Set or increment a line's quantity, creating the cart and the line as needed. */
    upsertLine,

    /**
     * Drop one line from a user's cart.
     *
     * Resolves `null` when the cart does not exist or does not hold the product — the filter asks
     * for both — which is what lets the service answer 404 without a separate read.
     */
    removeLine: (userId: string, productId: string) =>
        cartModel
            .findOneAndUpdate(
                { userId: toObjectId(userId), 'items.productId': toObjectId(productId) },
                { $pull: { items: { productId: toObjectId(productId) } } },
                { returnDocument: 'after' }
            )
            .exec(),

    /**
     * Empty a user's cart. Deliberately does NOT upsert: a user with no cart is already in the
     * state this asks for, and `null` reads as exactly that.
     */
    clearLines: (userId: string) =>
        cartModel
            .findOneAndUpdate(
                { userId: toObjectId(userId) },
                { $set: { items: [] } },
                { returnDocument: 'after' }
            )
            .exec(),

    /**
     * Empty a user's cart ONLY IF it still holds exactly the lines the caller read.
     *
     * The conditional-write half of checkout: emptying the cart is the step that can fail, so
     * exactly one of two parallel `POST /cart/checkout` matches, and the loser undoes the order
     * it already wrote — without this, one cart yields two orders and the customer is charged twice.
     *
     * `$inc: { __v: 1 }` makes the guard reusable — a cart emptied and refilled would otherwise
     * still match an in-flight checkout's version. Mongoose's own optimistic concurrency doesn't
     * apply (it covers `save()`, not `findOneAndUpdate`); a transaction would work too but forces
     * `MongoMemoryReplSet` on every cart-touching suite.
     *
     * @param userId - whose cart
     * @param version - the `__v` the caller read the cart at
     * @returns the emptied cart, or `null` when the cart moved and the caller lost the race
     */
    clearLinesIfUnchanged: (userId: string, version: number) =>
        cartModel
            .findOneAndUpdate(
                /* `__v` below is Mongoose's version key; the name belongs to the driver. */
                { userId: toObjectId(userId), __v: version },
                { $set: { items: [] }, $inc: { __v: 1 } },
                { returnDocument: 'after', timestamps: false }
            )
            .exec(),

    /**
     * Delete a user's cart outright — what a hard account deletion owes the carts.
     *
     * While the cart lived inside the user document this came free; it does not any more, and an
     * orphaned cart would outlive the account it belongs to with no way to reach it.
     */
    deleteByUserId: (userId: string) =>
        cartModel
            .deleteOne({ userId: toObjectId(userId) })
            .exec()
            .then(() => {
                // explicit void return
            }),

    /**
     * Drop one product from every cart that holds it — what a product deletion owes the carts.
     */
    removeProductFromAll: (productId: string) =>
        cartModel
            .updateMany(
                { 'items.productId': toObjectId(productId) },
                { $pull: { items: { productId: toObjectId(productId) } } }
            )
            .exec()
};
