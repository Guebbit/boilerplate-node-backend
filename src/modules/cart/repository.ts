import type { UpdateWriteOpResult } from 'mongoose';
import { cartModel, applyCartTransform } from './model';
import type { ICartDocument } from './model';
import { isDuplicateKey } from '@infrastructure/http/errors';
import {
    createBaseRepository,
    toObjectId,
    type IBaseRepository
} from '@infrastructure/persistence/base-repository';

/** How {@link upsertLine} treats a quantity for a line already in the cart. */
export type TCartLineMode = 'set' | 'add';

/**
 * Set or increment one cart line, creating the cart if the user has none.
 *
 * Two writes at most, and the second only for a product the cart has never held. Each carries its
 * condition IN THE FILTER rather than in a preceding read, so mongod evaluates it while holding
 * the document: two requests adding the same product cannot both conclude "absent" and both
 * append, which is what leaves a cart with one product on two lines.
 *
 * The one that loses that race hits the unique `userId` index, in either of two ways — the cart
 * now holds the line, so `$ne` matches nothing and `upsert` tries to insert a second cart; or
 * neither request found a cart and both tried to create one. Both mean the same thing: the world
 * moved between the two steps.
 *
 * So a duplicate key is retried rather than surfaced, which is what MongoDB prescribes for a
 * contended upsert. It converges — on the next pass either the line exists (increment) or the cart
 * exists without it (append, no insert attempted). The budget only bounds a pathological loop.
 */
const upsertLine = (
    userId: string,
    productId: string,
    quantity: number,
    mode: TCartLineMode,
    attemptsLeft = 3
): Promise<ICartDocument> => {
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
 * Standard CRUD via the base factory, plus the four writes a cart actually takes.
 *
 * Every one of them is keyed by `userId` and none of them takes a cart id: `userId` is `unique` on
 * the schema, so "the user's cart" is a complete address. That is what keeps `findOneAndUpdate`
 * enough for each mutation, and it is why no caller ever has to fetch a cart before changing it.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize an
 * inferred one at an export boundary (TS7056) — the same reason `IBaseRepository` exists.
 */
export const cartRepository: IBaseRepository<ICartDocument> & {
    findByUserId: (userId: string) => Promise<ICartDocument | null>;
    upsertLine: (
        userId: string,
        productId: string,
        quantity: number,
        mode: TCartLineMode
    ) => Promise<ICartDocument>;
    removeLine: (userId: string, productId: string) => Promise<ICartDocument | null>;
    clearLines: (userId: string) => Promise<ICartDocument | null>;
    clearLinesIfUnchanged: (userId: string, version: number) => Promise<ICartDocument | null>;
    deleteByUserId: (userId: string) => Promise<void>;
    removeProductFromAll: (productId: string) => Promise<UpdateWriteOpResult>;
} = {
    ...createBaseRepository<ICartDocument>(cartModel, {
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
     * The conditional-write half of checkout: emptying the cart is made the step that can fail, so
     * exactly one of two parallel `POST /cart/checkout` matches and the loser undoes the order it
     * already wrote. Without it, one cart yields two orders and the customer is charged twice.
     *
     * `$inc: { __v: 1 }` makes the guard reusable — otherwise a cart emptied and refilled still
     * matches the version an in-flight checkout holds. Mongoose's own optimistic concurrency does
     * not apply: it covers `save()` on a loaded document, and every write here is
     * `findOneAndUpdate`. A transaction would also work but would force `MongoMemoryReplSet` on
     * every suite touching a cart, to serialise two writes to one document.
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
