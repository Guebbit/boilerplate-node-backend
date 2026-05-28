import { Types } from 'mongoose';
import type { CastError } from 'mongoose';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@utils/response';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
import type { IOrderDocument } from '@models/orders';
import type { IUserDocument, ICartItem } from '@models/users';
import type { IProductDocument } from '@models/products';
import { userRepository } from '@repositories/users';
import { orderRepository } from '@repositories/orders';

/**
 * Cart Service
 * Single responsibility: shopping cart operations.
 * Accepts userId (string) to decouple controllers from Mongoose documents.
 */

/** Normalize any Mongoose/plain id shape to a plain string. */
const toObjectIdString = (value: unknown): string => {
    if (value instanceof Types.ObjectId) return value.toString();
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value && 'id' in value && typeof value.id === 'string')
        return value.id;
    if (typeof value === 'object' && value && '_id' in value) return toObjectIdString(value._id);
    return '';
};

/** Check if a cart item's product field matches the given string id. */
const matchesProductId = (product: unknown, id: string): boolean =>
    toObjectIdString(product) === id;

/** Wrap saved user in a success response, ensuring _id is always present. */
const generateUserSuccess = (user: IUserDocument): IResponseSuccess<IUserDocument> => {
    const response = generateSuccess(user);
    const data = response.data as { _id?: unknown; id?: unknown };
    if (!data._id && typeof data.id === 'string') {
        data._id = data.id;
    }
    return response;
};

/** Load user by ID or reject with 404. */
const loadUser = (userId: string): Promise<IUserDocument> =>
    userRepository.findById(userId).then((user) => {
        if (!user) throw new Error('User not found');
        return user;
    });

/**
 * Get user cart populated with product details.
 */
export const cartGet = (userId: string): Promise<ICartItem[]> =>
    loadUser(userId).then((user) =>
        user.populate('cart.items.product').then(({ cart: { items = [] } }) => items)
    );

/**
 * Get user cart with computed summary (item count, total quantity, total price).
 */
export const cartGetWithSummary = (
    userId: string
): Promise<{
    items: ICartItem[];
    summary: { itemsCount: number; totalQuantity: number; total: number };
}> =>
    cartGet(userId).then((items) => {
        let totalQuantity = 0;
        let total = 0;
        for (const item of items) {
            totalQuantity += item.quantity;
            const product = item.product as { price?: number };
            total += (product?.price ?? 0) * item.quantity;
        }
        return {
            items,
            summary: {
                itemsCount: items.length,
                totalQuantity,
                total
            }
        };
    });

/**
 * Set quantity of target product in cart (by product ID).
 */
export const cartItemSetById = (
    userId: string,
    productId: string,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> =>
    loadUser(userId).then((user) => {
        const cartProductIndex = user.cart.items.findIndex((item) =>
            matchesProductId(item.product, productId)
        );

        if (cartProductIndex === -1)
            user.cart.items.push({
                product: new Types.ObjectId(productId),
                quantity
            });
        else user.cart.items[cartProductIndex].quantity = quantity;

        user.cart.updatedAt = new Date();
        return userRepository.save(user).then((savedUser) => generateUserSuccess(savedUser));
    });

/**
 * Set quantity of target product in cart (by product document).
 */
export const cartItemSet = (
    userId: string,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemSetById(userId, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Add quantity of target product to existing quantity in cart.
 */
export const cartItemAddById = (
    userId: string,
    productId: string,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> =>
    loadUser(userId).then((user) => {
        const cartProductIndex = user.cart.items.findIndex((item) =>
            matchesProductId(item.product, productId)
        );

        if (cartProductIndex === -1)
            user.cart.items.push({
                product: new Types.ObjectId(productId),
                quantity
            });
        else
            user.cart.items[cartProductIndex].quantity =
                user.cart.items[cartProductIndex].quantity + quantity;

        user.cart.updatedAt = new Date();
        return userRepository.save(user).then((savedUser) => generateUserSuccess(savedUser));
    });

/**
 * Add quantity of target product to cart (by product document).
 */
export const cartItemAdd = (
    userId: string,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemAddById(userId, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Remove target product from cart (by product ID).
 */
export const cartItemRemoveById = (
    userId: string,
    productId: string
): Promise<IResponseSuccess<IUserDocument>> =>
    loadUser(userId).then((user) => {
        user.cart.items = user.cart.items.filter(
            ({ product }: ICartItem) => !matchesProductId(product, productId)
        );
        user.cart.updatedAt = new Date();
        return userRepository.save(user).then((savedUser) => generateUserSuccess(savedUser));
    });

/**
 * Remove target product from cart (by product document).
 */
export const cartItemRemove = (
    userId: string,
    product: IProductDocument
): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemRemoveById(userId, (product._id as Types.ObjectId).toString());

/**
 * Remove all products from cart.
 */
export const cartRemove = (userId: string): Promise<IResponseSuccess<IUserDocument>> =>
    loadUser(userId).then((user) => {
        user.cart = {
            items: [],
            updatedAt: new Date()
        };
        return userRepository.save(user).then((savedUser) => generateUserSuccess(savedUser));
    });

/**
 * Create order from current user cart and empty the cart.
 */
export const orderConfirm = (
    userId: string
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> =>
    loadUser(userId)
        .then((user) =>
            cartGet(userId).then<IResponseSuccess<IOrderDocument> | IResponseReject>((products) => {
                if (products.length === 0)
                    return generateReject(409, 'empty cart', ['Cart is empty']);
                return orderRepository
                    .create({
                        userId: new Types.ObjectId(userId),
                        email: user.email,
                        items: products as IOrderDocument['items']
                    } as Partial<IOrderDocument>)
                    .then((order) =>
                        cartRemove(userId).then(() => generateSuccess<IOrderDocument>(order))
                    );
            })
        )
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
