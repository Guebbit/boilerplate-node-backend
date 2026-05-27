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
 * Single responsibility: shopping cart operations on a user document.
 */

const toObjectIdString = (value: unknown): string => {
    if (value instanceof Types.ObjectId) return value.toString();
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value && 'id' in value && typeof value.id === 'string')
        return value.id;
    if (typeof value === 'object' && value && '_id' in value) return toObjectIdString(value._id);
    return '';
};

const matchesProductId = (product: unknown, id: string): boolean =>
    toObjectIdString(product) === id;

const resolveUserId = (user: IUserDocument): string =>
    toObjectIdString(user._id) || toObjectIdString(user.id);

const generateUserSuccess = (user: IUserDocument): IResponseSuccess<IUserDocument> => {
    const response = generateSuccess(user);
    const data = response.data as { _id?: unknown; id?: unknown };
    if (!data._id && typeof data.id === 'string') {
        data._id = data.id;
    }
    return response;
};

/**
 * Get user cart populated with product details.
 */
export const cartGet = (user: IUserDocument): Promise<ICartItem[]> => {
    if (typeof user.populate === 'function')
        return user.populate('cart.items.product').then(({ cart: { items = [] } }) => items);

    const userId = resolveUserId(user);
    if (!userId) return Promise.resolve(user.cart.items ?? []);

    return userRepository.findById(userId).then((freshUser) => {
        if (!freshUser) return user.cart.items ?? [];
        return freshUser.populate('cart.items.product').then(({ cart: { items = [] } }) => items);
    });
};

/**
 * Get user cart with computed summary (item count, total quantity, total price).
 */
export const cartGetWithSummary = (
    user: IUserDocument
): Promise<{
    items: ICartItem[];
    summary: { itemsCount: number; totalQuantity: number; total: number };
}> =>
    cartGet(user).then((items) => {
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
 * Set quantity of target product in cart (by ID).
 */
export const cartItemSetById = (
    user: IUserDocument,
    id: string,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> => {
    const cartProductIndex = user.cart.items.findIndex((item) =>
        matchesProductId(item.product, id)
    );

    if (cartProductIndex === -1)
        user.cart.items.push({
            product: new Types.ObjectId(id),
            quantity
        });
    else user.cart.items[cartProductIndex].quantity = quantity;

    user.cart.updatedAt = new Date();
    return userRepository.save(user).then((savedUser) => generateUserSuccess(savedUser));
};

/**
 * Set quantity of target product in cart (by product document).
 */
export const cartItemSet = (
    user: IUserDocument,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemSetById(user, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Add quantity of target product to existing quantity in cart.
 */
export const cartItemAddById = (
    user: IUserDocument,
    id: string,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> => {
    const cartProductIndex = user.cart.items.findIndex((item) =>
        matchesProductId(item.product, id)
    );

    if (cartProductIndex === -1)
        user.cart.items.push({
            product: new Types.ObjectId(id),
            quantity
        });
    else
        user.cart.items[cartProductIndex].quantity =
            user.cart.items[cartProductIndex].quantity + quantity;

    user.cart.updatedAt = new Date();
    return userRepository.save(user).then((savedUser) => generateUserSuccess(savedUser));
};

/**
 * Add quantity of target product to cart (by product document).
 */
export const cartItemAdd = (
    user: IUserDocument,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemAddById(user, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Remove target product from cart (by ID).
 */
export const cartItemRemoveById = (
    user: IUserDocument,
    id: string
): Promise<IResponseSuccess<IUserDocument>> => {
    user.cart.items = user.cart.items.filter(
        ({ product }: ICartItem) => !matchesProductId(product, id)
    );
    user.cart.updatedAt = new Date();
    return userRepository.save(user).then((savedUser) => generateUserSuccess(savedUser));
};

/**
 * Remove target product from cart (by product document).
 */
export const cartItemRemove = (
    user: IUserDocument,
    product: IProductDocument
): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemRemoveById(user, (product._id as Types.ObjectId).toString());

/**
 * Remove all products from cart.
 */
export const cartRemove = (user: IUserDocument): Promise<IResponseSuccess<IUserDocument>> => {
    user.cart = {
        items: [],
        updatedAt: new Date()
    };
    return userRepository.save(user).then((savedUser) => generateUserSuccess(savedUser));
};

/**
 * Create order from current user cart and empty the cart.
 */
export const orderConfirm = (
    user: IUserDocument
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> =>
    cartGet(user)
        .then<IResponseSuccess<IOrderDocument> | IResponseReject>((products) => {
            if (products.length === 0)
                return generateReject(409, 'empty cart', ['Cart is empty']);
            return orderRepository
                .create({
                    userId: new Types.ObjectId(resolveUserId(user)),
                    email: user.email,
                    items: products as IOrderDocument['items']
                } as Partial<IOrderDocument>)
                .then((order) =>
                    cartRemove(user).then(() => generateSuccess<IOrderDocument>(order))
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
