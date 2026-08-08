import { Types } from 'mongoose';
import type { CastError } from 'mongoose';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@core/http/response';
import { databaseErrorInterpreter } from '@core/http/errors';
import { sumLineItems } from '@core/totals';
import type { IOrderDocument } from '@models/orders';
import type { IUserDocument } from '@models/users';
import type { IProductDocument } from '@models/products';
import { userRepository } from '@repositories/users';
import { orderRepository } from '@repositories/orders';
import type { CartItem } from '@types';

/**
 * Cart Service
 * Single responsibility: shopping cart operations, identified by userId.
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
 * A user's cart after `populate('cart.items.product')`.
 *
 * Names what Mongoose swaps into the reference field, so the populated read is typed rather than
 * cast. Spelled as the whole `cart` key because `populate<T>` merges `T` over the document's
 * top-level properties — a dotted path is not a key it can merge on.
 */
interface IPopulatedCart {
    cart: {
        items: { product: IProductDocument | null; quantity: number }[];
        updatedAt: Date;
    };
}

/** Narrow a line to one whose product actually exists. */
const isJoined = (line: ICartLine): line is TJoinedCartLine => line.product !== null;

/**
 * Check if a stored cart line points at the given product id.
 *
 * Takes the reference as the `ObjectId` it always is on this path: every caller reaches it
 * through {@link requireUser}, which does not populate.
 */
const matchesProductId = (product: Types.ObjectId, id: string): boolean => product.equals(id);

/** Fetch user by string id, resolving 404 as IResponseReject. */
const requireUser = (userId: string): Promise<IUserDocument | IResponseReject> =>
    userRepository.findById(userId).then((user) => {
        if (!user) return generateReject(404, 'cart - user not found', []);
        return user;
    });

/**
 * Join a user's cart lines to their products, in one query.
 *
 * The ids are read before `populate()` runs, because populate replaces the reference field with
 * the fetched document — or with `null` for a product that has since been deleted.
 */
const readCartLines = (user: IUserDocument): Promise<ICartLine[]> => {
    const productIds = user.cart.items.map(({ product }) => product.toString());

    return user.populate<IPopulatedCart>('cart.items.product').then(({ cart: { items = [] } }) =>
        items.map(({ product, quantity }, index) => ({
            productId: productIds[index],
            quantity,
            product
        }))
    );
};

/** Mutate user document to clear the cart in place. */
const clearCartItems = (user: IUserDocument): void => {
    user.cart = { items: [], updatedAt: new Date() };
};

/**
 * Get user cart, each line joined with its product.
 */
export const cartGet = (userId: string): Promise<ICartLine[]> =>
    userRepository.findById(userId).then((user) => {
        if (!user) return [];
        return readCartLines(user);
    });

/**
 * Get user cart with computed summary (item count, total quantity, total price).
 *
 * The joined `product` is used to price the cart and is then dropped: `CartItem` in
 * `openapi.yaml` is `additionalProperties: false` over `{ productId, quantity }`, so shipping the
 * whole product per line is over-serialization the contract suite fails on. No client reads it —
 * the frontend renders the cart from `productId`/`quantity` and looks products up in its own
 * store. Use {@link cartGet} where the joined product is actually needed.
 */
export const cartGetWithSummary = (
    userId: string
): Promise<{
    items: CartItem[];
    summary: { itemsCount: number; totalQuantity: number; total: number };
}> =>
    cartGet(userId).then((lines) => {
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
 * Shared logic for adding/setting a cart item quantity.
 *
 * Resolves an empty success: every cart controller answers with a fresh
 * {@link cartGetWithSummary}, which is the only cart shape `openapi.yaml` declares.
 */
const upsertCartItem = (
    userId: string,
    id: string,
    quantity: number,
    mode: 'set' | 'add'
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    requireUser(userId).then((result) => {
        if (!('cart' in result)) return result as IResponseReject;
        const user = result as IUserDocument;
        const cartProductIndex = user.cart.items.findIndex((item) =>
            matchesProductId(item.product, id)
        );
        if (cartProductIndex === -1)
            user.cart.items.push({ product: new Types.ObjectId(id), quantity });
        else
            user.cart.items[cartProductIndex].quantity =
                mode === 'set' ? quantity : user.cart.items[cartProductIndex].quantity + quantity;
        user.cart.updatedAt = new Date();
        return userRepository.save(user).then(() => generateSuccess(undefined, 200));
    });

/**
 * Set quantity of target product in cart (by ID).
 */
export const cartItemSetById = (
    userId: string,
    id: string,
    quantity = 1
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    upsertCartItem(userId, id, quantity, 'set');

/**
 * Set quantity of target product in cart (by product document).
 */
export const cartItemSet = (
    userId: string,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    cartItemSetById(userId, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Add quantity of target product to existing quantity in cart (by ID).
 */
export const cartItemAddById = (
    userId: string,
    id: string,
    quantity = 1
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    upsertCartItem(userId, id, quantity, 'add');

/**
 * Add quantity of target product to cart (by product document).
 */
export const cartItemAdd = (
    userId: string,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    cartItemAddById(userId, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Remove target product from cart (by ID).
 */
export const cartItemRemoveById = (
    userId: string,
    id: string
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    requireUser(userId).then((result) => {
        if (!('cart' in result)) return result as IResponseReject;
        const user = result as IUserDocument;
        const before = user.cart.items.length;
        user.cart.items = user.cart.items.filter(({ product }) => !matchesProductId(product, id));
        if (user.cart.items.length === before)
            return generateReject(404, 'cart - item not found', []);
        user.cart.updatedAt = new Date();
        return userRepository.save(user).then(() => generateSuccess(undefined, 200));
    });

/**
 * Remove target product from cart (by product document).
 */
export const cartItemRemove = (
    userId: string,
    product: IProductDocument
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    cartItemRemoveById(userId, (product._id as Types.ObjectId).toString());

/**
 * Remove all products from cart.
 */
export const cartRemove = (
    userId: string
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    requireUser(userId).then((result) => {
        if (!('cart' in result)) return result as IResponseReject;
        const user = result as IUserDocument;
        clearCartItems(user);
        return userRepository.save(user).then(() => generateSuccess(undefined, 200));
    });

/**
 * Create order from current user cart and empty the cart.
 *
 * A line whose product no longer exists rejects the whole checkout, matching what
 * `@services/orders` `create()` already does for an unresolvable product id: an order embeds a
 * snapshot, and there is nothing to snapshot.
 */
export const orderConfirm = (
    userId: string
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> =>
    requireUser(userId)
        .then((result) => {
            if (!('cart' in result)) return result as IResponseReject;
            const user = result as IUserDocument;
            return readCartLines(user).then<IResponseSuccess<IOrderDocument> | IResponseReject>(
                (lines) => {
                    if (lines.length === 0)
                        return generateReject(409, 'empty cart', ['Cart is empty']);

                    const joined = lines.filter((line) => isJoined(line));
                    if (joined.length !== lines.length)
                        return generateReject(404, 'checkout - product not found', []);

                    return orderRepository
                        .create({
                            userId: new Types.ObjectId(user.id),
                            email: user.email,
                            items: joined.map(({ product, quantity }) => ({ product, quantity }))
                        } as Partial<IOrderDocument>)
                        .then((order) => {
                            clearCartItems(user);
                            return userRepository
                                .save(user)
                                .then(() => generateSuccess<IOrderDocument>(order));
                        });
                }
            );
        })
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));

/**
 * Remove a product from all users' carts by product ID.
 */
export const productRemoveFromCartsById = (
    id: string
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    userRepository
        .updateMany(
            {
                'cart.items.product': id
            },
            {
                $pull: {
                    'cart.items': {
                        product: id
                    }
                },
                $set: {
                    'cart.updatedAt': new Date()
                }
            }
        )
        .then((result) =>
            generateSuccess(
                undefined,
                200,
                `Product ${id} removed from ${result.modifiedCount} cart(s)`
            )
        )
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));

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
    orderConfirm,
    productRemoveFromCartsById
};
