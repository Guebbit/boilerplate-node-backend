/**
 * @module
 * Cart repository — the repository factory's standard CRUD, plus the six writes a cart actually
 * takes: upsert a line, remove a line, clear all lines (plain and version-guarded for checkout),
 * and the two cleanup writes owed to product and user deletion.
 *
 * See: docs/modules/cart.md
 */

import type { UpdateWriteOpResult, QueryFilter } from 'mongoose';
import { Types } from 'mongoose';
import { cartModel, applyCartTransform, CART_LINE_MAX } from './model';
import type { CartDocument } from './model';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';

/** How {@link upsertLine} treats a quantity for a line already in the cart. */
export type CartLineMode = 'set' | 'add';

/**
 * What {@link upsertLine} resolves to in `'add'` mode when the increment would push a line past
 * {@link CART_LINE_MAX} — there is nothing to return, since nothing was written.
 */
export const QUANTITY_LIMIT = 'quantity-limit';

/** Pushes a brand-new line onto the cart, creating the cart document itself if none exists yet. */
const pushNewLine = (
    owner: QueryFilter<CartDocument>,
    line: Types.ObjectId,
    quantity: number
): Promise<CartDocument> =>
    cartModel
        .findOneAndUpdate(
            { ...owner, 'items.productId': { $ne: line } },
            { $push: { items: { productId: line, quantity } } },
            { upsert: true, returnDocument: 'after' }
        )
        .exec();

/**
 * Set or increment one cart line, creating the cart if the user has none.
 *
 * CONCURRENCY. Each write's condition lives IN THE FILTER, not a preceding read, so mongod
 * evaluates it while holding the document — two requests adding the same product cannot both
 * conclude "absent" and both append. The loser instead hits the unique `userId` index (a second
 * cart insert, or a duplicate line), so a duplicate key is retried rather than surfaced, per
 * MongoDB's own guidance for a contended upsert — it converges next pass. `attemptsLeft` only
 * bounds a pathological loop.
 *
 * `'add'` mode carries a second condition IN THE SAME FILTER — `quantity <= CART_LINE_MAX -
 * quantity` — so a line actually AT the cap can never pass it: that comparison is what the
 * document lock the increment already takes makes atomic, not a read beforehand two concurrent
 * adds could both act on. A filter miss is then ambiguous — no such line yet, or one that no
 * longer matches because a concurrent write already changed it — so it costs one more read to
 * settle: still no line, push it; room reappeared since the first attempt, retry the whole call
 * (the same convergence the duplicate-key branch below uses); genuinely no room, QUANTITY_LIMIT.
 */
const upsertLine = (
    userId: string,
    productId: string,
    quantity: number,
    mode: CartLineMode,
    attemptsLeft = 3
): Promise<CartDocument | typeof QUANTITY_LIMIT> => {
    const owner = { userId: toObjectId(userId) };
    const line = toObjectId(productId);

    // `$elemMatch`, not two top-level `'items.x'` conditions: MongoDB only guarantees the update's
    // `items.$` binds to the element BOTH conditions matched together when they are joined this
    // way — two separate conditions can each match a DIFFERENT element, and `$` then updates
    // whichever the FIRST one found. Silent on a passing case (any two-line cart still updates
    // SOME line), so it only ever showed up as `q` landing on the wrong product.
    // https://www.mongodb.com/docs/manual/reference/operator/update/positional/#--em-multiple--em--array-conditions
    const matchExistingLine: QueryFilter<CartDocument> =
        mode === 'set'
            ? { ...owner, 'items.productId': line }
            : {
                  ...owner,
                  items: {
                      $elemMatch: { productId: line, quantity: { $lte: CART_LINE_MAX - quantity } }
                  }
              };

    return (
        cartModel
            .findOneAndUpdate(
                matchExistingLine,
                mode === 'set'
                    ? { $set: { 'items.$.quantity': quantity } }
                    : { $inc: { 'items.$.quantity': quantity } },
                { returnDocument: 'after' }
            )
            .exec()
            // Explicit generic: without it, TS infers this callback's return type from the OUTER
            // function's declared return rather than its own body, and drops the `QUANTITY_LIMIT`
            // branch below.
            .then<CartDocument | typeof QUANTITY_LIMIT>((cart) => {
                if (cart) return cart;
                if (mode === 'set') return pushNewLine(owner, line, quantity);

                return cartModel
                    .findOne({ ...owner, 'items.productId': line })
                    .exec()
                    .then<CartDocument | typeof QUANTITY_LIMIT>((existing) => {
                        const currentQuantity = existing?.items.find((item) =>
                            item.productId.equals(line)
                        )?.quantity;

                        if (currentQuantity === undefined)
                            return pushNewLine(owner, line, quantity);
                        if (currentQuantity + quantity > CART_LINE_MAX) return QUANTITY_LIMIT;

                        // Room exists now, even though the atomic attempt above just missed — read
                        // afterward, so still not the answer itself; only the next attempt's own
                        // filter can commit to it.
                        if (attemptsLeft <= 1)
                            throw new Error('cart: exhausted retries resolving a contended add');
                        return upsertLine(userId, productId, quantity, mode, attemptsLeft - 1);
                    });
            })
            .catch((error: unknown) => {
                if (attemptsLeft <= 1 || !isDuplicateKey(error)) throw error;
                return upsertLine(userId, productId, quantity, mode, attemptsLeft - 1);
            })
    );
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
    ) => Promise<CartDocument | typeof QUANTITY_LIMIT>;
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
                /*
                 * `timestamps: false`, unlike `clearLines` above: this clear is checkout's own
                 * side effect, not something the shopper did to their cart, so it should not make
                 * an untouched cart read as "recently edited".
                 */
                { returnDocument: 'after', timestamps: false }
            )
            .exec(),

    /**
     * Delete a user's cart outright — what a hard account deletion owes the carts.
     *
     * The cart is its own collection, not embedded in the user document, so nothing deletes it for
     * free on account deletion — an orphaned cart would outlive the account it belongs to with no
     * way to reach it.
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
