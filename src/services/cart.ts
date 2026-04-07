import { t } from 'i18next';
import type { IOrderDocument, IOrderProduct } from '@models/orders';
import type { IUserDocument, ICartItem } from '@models/users';
import type { IProductDocument } from '@models/products';
import type { Order, Product } from '@types';
import { generateReject, generateSuccess, type IResponseReject, type IResponseSuccess } from '@utils/response';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
import { userRepository } from '@repositories/users';
import { orderRepository } from '@repositories/orders';
import { cartItemModel } from '@models/cart-items';
import { productModel } from '@models/products';
import { userTokenModel } from '@models/user-tokens';

const getUserId = (user: IUserDocument): number => Number((user as unknown as { id: number }).id);

/**
 * Rebuilds the user cart and token relations from normalized SQL tables.
 * This keeps response payloads compatible with the legacy user shape.
 */
const hydrateUserCart = async (user: IUserDocument): Promise<IUserDocument> => {
    const rows = await cartItemModel.findAll({
        where: { userId: getUserId(user) },
        include: [{ model: productModel, as: 'product' }]
    });

    (user as unknown as { cart: unknown }).cart = {
        items: rows.map(
            (row) =>
                ({
                    product: ((row as unknown as { product?: unknown }).product ??
                        Number((row as unknown as { productId: number }).productId)) as unknown,
                    quantity: Number((row as unknown as { quantity: number }).quantity)
                }) as never
        ),
        updatedAt: (user as unknown as { cartUpdatedAt: Date }).cartUpdatedAt
    };

    const tokens = await userTokenModel.findAll({
        where: { userId: getUserId(user) },
        raw: true
    });
    (user as unknown as { tokens: unknown }).tokens = tokens.map((token) => ({
        type: token.type,
        token: token.token,
        expiration: token.expiration ?? undefined
    }));

    return user;
};

export const cartGet = (user: IUserDocument): Promise<ICartItem[]> =>
    hydrateUserCart(user).then((u) => (u.cart?.items ?? []) as ICartItem[]);

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
            const product = item.product as unknown as { price?: number };
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

export const cartItemSetById = (
    user: IUserDocument,
    id: string,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> => {
    return cartItemModel
        .upsert({
            userId: getUserId(user),
            productId: Number(id),
            quantity
        } as never)
        .then(() =>
            (
                user as unknown as { update: (values: Record<string, unknown>) => Promise<unknown> }
            ).update({
                cartUpdatedAt: new Date()
            })
        )
        .then(() => hydrateUserCart(user))
        .then((savedUser) => generateSuccess(savedUser));
};

export const cartItemSet = (
    user: IUserDocument,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> => cartItemSetById(user, String(product.id), quantity);

export const cartItemAddById = (
    user: IUserDocument,
    id: string,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> => {
    return cartItemModel
        .findOne({
            where: {
                userId: getUserId(user),
                productId: Number(id)
            }
        })
        .then((row) => {
            if (!row)
                return cartItemModel.create({
                    userId: getUserId(user),
                    productId: Number(id),
                    quantity
                } as never);

            return row.update({
                quantity: Number((row as unknown as { quantity: number }).quantity) + quantity
            });
        })
        .then(() =>
            (
                user as unknown as { update: (values: Record<string, unknown>) => Promise<unknown> }
            ).update({
                cartUpdatedAt: new Date()
            })
        )
        .then(() => hydrateUserCart(user))
        .then((savedUser) => generateSuccess(savedUser));
};

export const cartItemAdd = (
    user: IUserDocument,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> => cartItemAddById(user, String(product.id), quantity);

export const cartItemRemoveById = (
    user: IUserDocument,
    id: string
): Promise<IResponseSuccess<IUserDocument>> => {
    return cartItemModel
        .destroy({
            where: {
                userId: getUserId(user),
                productId: Number(id)
            }
        })
        .then(() =>
            (
                user as unknown as { update: (values: Record<string, unknown>) => Promise<unknown> }
            ).update({
                cartUpdatedAt: new Date()
            })
        )
        .then(() => hydrateUserCart(user))
        .then((savedUser) => generateSuccess(savedUser));
};

export const cartItemRemove = (
    user: IUserDocument,
    product: IProductDocument
): Promise<IResponseSuccess<IUserDocument>> => cartItemRemoveById(user, String(product.id));

export const cartRemove = (user: IUserDocument): Promise<IResponseSuccess<IUserDocument>> => {
    return cartItemModel
        .destroy({ where: { userId: getUserId(user) } })
        .then(() =>
            (
                user as unknown as { update: (values: Record<string, unknown>) => Promise<unknown> }
            ).update({
                cartUpdatedAt: new Date()
            })
        )
        .then(() => hydrateUserCart(user))
        .then((savedUser) => generateSuccess(savedUser));
};

/**
 * Converts the current user cart into a persisted order and then empties the cart.
 */
export const orderConfirm = (
    user: IUserDocument
): Promise<IResponseSuccess<Order> | IResponseReject> =>
    cartGet(user)
        .then<IResponseSuccess<Order> | IResponseReject>((products) => {
            if (products.length === 0)
                return generateReject(409, 'empty cart', [t('generic.error-missing-data')]);

            const mappedProducts = products.map((entry) => {
                const product = entry.product as Partial<Product>;
                return {
                    product: {
                        id: product.id,
                        title: product.title,
                        price: product.price,
                        description: product.description,
                        imageUrl: product.imageUrl,
                        active: product.active
                    },
                    quantity: entry.quantity
                } as unknown as IOrderProduct;
            });

            return orderRepository
                .create({
                    userId: getUserId(user),
                    email: user.email,
                    products: mappedProducts
                } as Partial<IOrderDocument>)
                .then((order) =>
                    cartRemove(user).then(() => generateSuccess<Order>(order as unknown as Order))
                );
        })
        .catch((error: Error) => generateReject(...databaseErrorInterpreter(error)));

/**
 * Removes a product from all carts, used by product delete/toggle flows.
 */
export const productRemoveFromCartsById = (
    id: string
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    userRepository
        .updateMany(
            {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'cart.items.product': Number(id)
            },
            {
                removeFromCartItems: true
            }
        )
        .then((result) =>
            generateSuccess(
                undefined,
                200,
                t('ecommerce.product-was-deleted-from-all-carts', {
                    product: id,
                    count: result.modifiedCount
                })
            )
        )
        .catch((error: Error) => generateReject(...databaseErrorInterpreter(error)));

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
