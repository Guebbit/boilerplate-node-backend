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
import {
    toUserCartDto,
    toCartItemDto,
    toCartIdString,
    type ICartItemDto,
    type IUserCartDto
} from '@utils/dto-cart';

/**
 * Cart Service
 * Single responsibility: shopping cart operations, identified by userId.
 */

/** Check if a cart item's product field matches the given string id. */
const matchesProductId = (product: unknown, id: string): boolean => toCartIdString(product) === id;

/** Wrap saved user in a success response with an explicit DTO payload. */
const generateUserSuccess = (user: IUserDocument): IResponseSuccess<IUserCartDto> =>
    generateSuccess(toUserCartDto(user));

/** Fetch user by string id, resolving 404 as IResponseReject. */
const requireUser = (userId: string): Promise<IUserDocument | IResponseReject> =>
    userRepository.findById(userId).then((user) => {
        if (!user) return generateReject(404, 'cart - user not found', []);
        return user;
    });

/** Populate cart.items.product on an already-fetched user. */
const populateCartItems = (user: IUserDocument): Promise<ICartItem[]> =>
    user.populate('cart.items.product').then(({ cart: { items = [] } }) => items);

/** Mutate user document to clear the cart in place. */
const clearCartItems = (user: IUserDocument): void => {
    user.cart = { items: [], updatedAt: new Date() };
};

/**
 * Get user cart populated with product details.
 */
export const cartGet = (userId: string): Promise<ICartItemDto[]> =>
    userRepository
        .findById(userId)
        .then((user) => {
            if (!user) return [];
            return populateCartItems(user).then((items) => items.map((item) => toCartItemDto(item)));
        });

/**
 * Get user cart with computed summary (item count, total quantity, total price).
 */
export const cartGetWithSummary = (
    userId: string
): Promise<{
    items: ICartItemDto[];
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
 * Set quantity of target product in cart (by ID).
 */
export const cartItemSetById = (
    userId: string,
    id: string,
    quantity = 1
): Promise<IResponseSuccess<IUserCartDto> | IResponseReject> =>
    requireUser(userId).then((result) => {
        if (!('cart' in result)) return result as IResponseReject;
        const user = result as IUserDocument;
        const cartProductIndex = user.cart.items.findIndex((item) =>
            matchesProductId(item.product, id)
        );
        if (cartProductIndex === -1)
            user.cart.items.push({ product: new Types.ObjectId(id), quantity });
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
): Promise<IResponseSuccess<IUserCartDto> | IResponseReject> =>
    cartItemSetById(userId, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Add quantity of target product to existing quantity in cart (by ID).
 */
export const cartItemAddById = (
    userId: string,
    id: string,
    quantity = 1
): Promise<IResponseSuccess<IUserCartDto> | IResponseReject> =>
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
): Promise<IResponseSuccess<IUserCartDto> | IResponseReject> =>
    cartItemAddById(userId, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Remove target product from cart (by ID).
 */
export const cartItemRemoveById = (
    userId: string,
    id: string
): Promise<IResponseSuccess<IUserCartDto> | IResponseReject> =>
    requireUser(userId).then((result) => {
        if (!('cart' in result)) return result as IResponseReject;
        const user = result as IUserDocument;
        const before = user.cart.items.length;
        user.cart.items = user.cart.items.filter(
            ({ product }: ICartItem) => !matchesProductId(product, id)
        );
        if (user.cart.items.length === before) return generateReject(404, 'cart - item not found', []);
        user.cart.updatedAt = new Date();
        return userRepository.save(user).then((savedUser) => generateUserSuccess(savedUser));
    });

/**
 * Remove target product from cart (by product document).
 */
export const cartItemRemove = (
    userId: string,
    product: IProductDocument
): Promise<IResponseSuccess<IUserCartDto> | IResponseReject> =>
    cartItemRemoveById(userId, (product._id as Types.ObjectId).toString());

/**
 * Remove all products from cart.
 */
export const cartRemove = (
    userId: string
): Promise<IResponseSuccess<IUserCartDto> | IResponseReject> =>
    requireUser(userId).then((result) => {
        if (!('cart' in result)) return result as IResponseReject;
        const user = result as IUserDocument;
        clearCartItems(user);
        return userRepository.save(user).then((savedUser) => generateUserSuccess(savedUser));
    });

/**
 * Create order from current user cart and empty the cart.
 */
export const orderConfirm = (
    userId: string
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> =>
    requireUser(userId)
        .then((result) => {
            if (!('cart' in result)) return result as IResponseReject;
            const user = result as IUserDocument;
            return populateCartItems(user).then<IResponseSuccess<IOrderDocument> | IResponseReject>(
                (products) => {
                    if (products.length === 0)
                        return generateReject(409, 'empty cart', ['Cart is empty']);
                    return orderRepository
                        .create({
                            userId: new Types.ObjectId(user.id),
                            email: user.email,
                            items: products as IOrderDocument['items']
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
