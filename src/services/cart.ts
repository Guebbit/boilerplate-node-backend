import { Types } from 'mongoose';
import type { CastError } from 'mongoose';
import { t } from '@core/i18n';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@core/http/response';
import { rejectDatabaseEnvelope } from '@core/http/errors';
import { sumLineItems } from '@core/totals';
import type { IOrderDocument } from '@models/orders';
import type { ICartDocument } from '@models/carts';
import type { IProductDocument } from '@models/products';
import { cartRepository } from '@repositories/carts';
import { userRepository } from '@repositories/users';
import { orderRepository } from '@repositories/orders';
import type { CartItem } from '@types';

/**
 * Cart Service
 * Single responsibility: shopping cart operations, identified by userId.
 *
 * A cart is its own document keyed by `userId` (`@models/carts`), so every operation here is one
 * addressed write or one addressed read — nothing loads a user to touch their cart, and no mutation
 * needs a follow-up read to answer with the updated cart.
 *
 * Absence and emptiness are the same state: a user who has never added anything has no cart
 * document, and every read below answers that with an empty cart rather than a 404.
 */

/**
 * A cart line joined with the product it references.
 *
 * `productId` and `product` are separate fields on purpose. `populate()` overwrites the stored
 * reference in place, and it writes `null` there when the product no longer exists — so reading
 * the id off that field afterwards loses it exactly when a caller most needs to know which
 * product a broken line pointed at. {@link readCartLines} captures the id first.
 */
export interface ICartLine extends CartItem {
    /** The joined product, or `null` for a reference that resolves to nothing. */
    product: IProductDocument | null;
}

/** A cart line whose reference resolved — what an order may be built from. */
type TJoinedCartLine = ICartLine & { product: IProductDocument };

/**
 * The cart as `openapi.yaml` declares it: `CartResponse`, built rather than serialized.
 *
 * Every cart endpoint answers with this — the reads directly, the mutations as their payload —
 * which is why no controller has to re-read the cart after changing it.
 */
export interface ICartView {
    items: CartItem[];
    summary: { itemsCount: number; totalQuantity: number; total: number };
}

/**
 * A cart after `populate('items.productId')`.
 *
 * Names what Mongoose swaps into the reference field, so the populated read is typed rather than
 * cast. Spelled as the whole `items` key because `populate<T>` merges `T` over the document's
 * top-level properties — a dotted path is not a key it can merge on.
 */
interface IPopulatedCart {
    items: { productId: IProductDocument | null; quantity: number }[];
}

/** Narrow a line to one whose product actually exists. */
const isJoined = (line: ICartLine): line is TJoinedCartLine => line.product !== null;

/**
 * Join a cart's lines to their products, in one query.
 *
 * The ids are read before `populate()` runs, because populate replaces the reference field with
 * the fetched document — or with `null` for a product that has since been deleted.
 */
const readCartLines = (cart: ICartDocument | null): Promise<ICartLine[]> => {
    if (!cart) return Promise.resolve([]);

    const productIds = cart.items.map(({ productId }) => productId.toString());

    // No `items = []` fallback: the schema defaults the array, so a hydrated cart always has one.
    return cart.populate<IPopulatedCart>('items.productId').then(({ items }) =>
        items.map(({ productId, quantity }, index) => ({
            productId: productIds[index],
            quantity,
            product: productId
        }))
    );
};

/**
 * Turn a cart document into the response the contract declares.
 *
 * The joined `product` prices the cart and is then dropped: `CartItem` in `openapi.yaml` is
 * `additionalProperties: false` over `{ productId, quantity }`, so shipping the whole product per
 * line is over-serialization the contract suite fails on. No client reads it — the frontend renders
 * the cart from `productId`/`quantity` and looks products up in its own store. Use {@link cartGet}
 * where the joined product is actually needed.
 */
const toCartView = (cart: ICartDocument | null): Promise<ICartView> =>
    readCartLines(cart).then((lines) => {
        const { count, quantity, price } = sumLineItems(lines);
        return {
            items: lines.map(({ productId, quantity: lineQuantity }) => ({
                productId,
                quantity: lineQuantity
            })),
            summary: {
                itemsCount: count,
                totalQuantity: quantity,
                total: price
            }
        };
    });

/**
 * Get user cart, each line joined with its product.
 */
export const cartGet = (userId: string): Promise<ICartLine[]> =>
    cartRepository.findByUserId(userId).then((cart) => readCartLines(cart));

/**
 * Get user cart with computed summary (item count, total quantity, total price).
 */
export const cartGetWithSummary = (userId: string): Promise<ICartView> =>
    cartRepository.findByUserId(userId).then((cart) => toCartView(cart));

/*
 * The mutations below return the updated cart, not a success envelope.
 *
 * Only `cartItemRemoveById` can fail, so only it carries one. The rest have no rejection to
 * report: `upsert` creates whatever is missing and clearing an already-empty cart is the state
 * the caller asked for. An envelope on those would be a union with one branch, and every
 * controller would still have to unwrap it to answer.
 */

/**
 * Shared logic for adding/setting a cart item quantity.
 *
 * One write: the repository's update pipeline creates the cart, appends the line or rewrites its
 * quantity server-side and hands back the result, so the only remaining query is the join that
 * prices the answer.
 */
const upsertCartItem = (
    userId: string,
    id: string,
    quantity: number,
    mode: 'set' | 'add'
): Promise<ICartView> =>
    cartRepository.upsertLine(userId, id, quantity, mode).then((cart) => toCartView(cart));

/**
 * Set quantity of target product in cart (by ID).
 */
export const cartItemSetById = (userId: string, id: string, quantity = 1): Promise<ICartView> =>
    upsertCartItem(userId, id, quantity, 'set');

/**
 * Set quantity of target product in cart (by product document).
 */
export const cartItemSet = (
    userId: string,
    product: IProductDocument,
    quantity = 1
): Promise<ICartView> =>
    cartItemSetById(userId, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Add quantity of target product to existing quantity in cart (by ID).
 */
export const cartItemAddById = (userId: string, id: string, quantity = 1): Promise<ICartView> =>
    upsertCartItem(userId, id, quantity, 'add');

/**
 * Add quantity of target product to cart (by product document).
 */
export const cartItemAdd = (
    userId: string,
    product: IProductDocument,
    quantity = 1
): Promise<ICartView> =>
    cartItemAddById(userId, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Remove target product from cart (by ID).
 *
 * 404 rather than a silent success: a client deleting a line it cannot see needs to know its view
 * is stale. The repository's filter asks for the cart AND the line, so a `null` result covers both
 * "no cart" and "no such line" without a second query.
 */
export const cartItemRemoveById = (
    userId: string,
    id: string
): Promise<IResponseSuccess<ICartView> | IResponseReject> =>
    cartRepository.removeLine(userId, id).then((cart) => {
        if (!cart) return generateReject(404, []);
        return toCartView(cart).then((view) => generateSuccess(view, 200));
    });

/**
 * Remove target product from cart (by product document).
 */
export const cartItemRemove = (
    userId: string,
    product: IProductDocument
): Promise<IResponseSuccess<ICartView> | IResponseReject> =>
    cartItemRemoveById(userId, (product._id as Types.ObjectId).toString());

/**
 * Remove all products from cart.
 *
 * Idempotent: a user with no cart document is already in the state this asks for, and the empty
 * view says so.
 */
export const cartRemove = (userId: string): Promise<ICartView> =>
    cartRepository.clearLines(userId).then((cart) => toCartView(cart));

/**
 * Create order from current user cart and empty the cart.
 *
 * The user is loaded for one reason — an order records the address it was placed from — so a
 * checkout for an account that no longer exists is the one cart operation that can still 404.
 *
 * A line whose product no longer exists rejects the whole checkout, matching what
 * `@services/orders` `create()` already does for an unresolvable product id: an order embeds a
 * snapshot, and there is nothing to snapshot.
 *
 * CONCURRENCY. Read cart → write order → empty cart is three statements, and until the cart write
 * was made conditional, nothing tied the third to the first. Two parallel `POST /cart/checkout`
 * both read the same lines, both wrote an order, and both emptied an already-empty cart: one cart,
 * two orders, the customer charged twice. A double-clicked button is enough to reach it.
 *
 * So the cart is emptied CONDITIONALLY, on the `__v` it was read at, and that write is what
 * decides the race — exactly one of the two matches. The loser has already created an order by
 * then, which is the cost of not using a transaction, so it deletes it and answers 409. That
 * ordering matters: the order is written first and retracted on failure, rather than the cart
 * being cleared first, because an order that briefly exists and is removed is recoverable while a
 * cart emptied without an order is a customer's basket silently thrown away.
 *
 * The 409 is deliberate rather than a retry. The loser's cart is empty and its lines are on the
 * winner's order — the request has been superseded, not defeated, and re-running it would produce
 * "empty cart" anyway. `@repositories/carts` `clearLinesIfUnchanged` documents why the guard is a
 * conditional write rather than a transaction.
 */
export const orderConfirm = (
    userId: string
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> =>
    userRepository
        .findById(userId)
        .then<IResponseSuccess<IOrderDocument> | IResponseReject>((user) => {
            if (!user) return generateReject(404, []);

            return cartRepository.findByUserId(userId).then((cart) => {
                // The version the lines below are read at, and the condition the cart is emptied
                // under. Captured before the join, so anything that touches the cart while the
                // products are being resolved invalidates this checkout rather than being missed.
                const version = cart?.__v ?? 0;

                return readCartLines(cart).then((lines) => {
                    // Explicit `code`s rather than bare strings: the checkout-failure analytics
                    // event reports this code, so it must stay stable and locale-independent
                    // while `message` is translated for the user.
                    if (lines.length === 0)
                        return generateReject(409, [
                            { code: 'CART_EMPTY', message: t('ecommerce.cart-empty') }
                        ]);

                    const joined = lines.filter((line) => isJoined(line));
                    if (joined.length !== lines.length)
                        return generateReject(404, [
                            {
                                code: 'CART_PRODUCT_UNAVAILABLE',
                                message: t('ecommerce.cart-product-unavailable')
                            }
                        ]);

                    return orderRepository
                        .create({
                            userId: new Types.ObjectId(user.id),
                            email: user.email,
                            items: joined.map(({ product, quantity }) => ({ product, quantity }))
                        } as Partial<IOrderDocument>)
                        .then((order) =>
                            cartRepository
                                .clearLinesIfUnchanged(userId, version)
                                .then((clearedCart) => {
                                    if (clearedCart) return generateSuccess<IOrderDocument>(order);

                                    // Lost the race: retract the order this request wrote, so the
                                    // cart's contents end up on exactly one of them.
                                    return orderRepository.deleteOne(order).then(() =>
                                        generateReject(409, [
                                            {
                                                code: 'CART_CHANGED',
                                                message: t('ecommerce.cart-changed')
                                            }
                                        ])
                                    );
                                })
                        );
                });
            });
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('cart', error));

/**
 * Delete a user's cart outright, for a hard account deletion.
 *
 * Distinct from {@link cartRemove}, which empties a cart the user still has. Mirrors what
 * `productRemoveFromCartsById` does for a deleted product: the cart no longer lives inside the
 * user document, so nothing cleans up after it unless this is called.
 */
export const cartDeleteByUserId = (userId: string): Promise<void> =>
    cartRepository.deleteByUserId(userId);

/**
 * Remove a product from all users' carts by product ID.
 */
export const productRemoveFromCartsById = (
    id: string
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    cartRepository
        .removeProductFromAll(id)
        .then((result) =>
            generateSuccess(
                undefined,
                200,
                `Product ${id} removed from ${result.modifiedCount} cart(s)`
            )
        )
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('cart', error));

export const cartService = {
    cartGet,
    cartGetWithSummary,
    cartItemSetById,
    cartItemSet,
    cartItemAddById,
    cartItemAdd,
    cartItemRemoveById,
    cartItemRemove,
    cartRemove,
    cartDeleteByUserId,
    orderConfirm,
    productRemoveFromCartsById
};
