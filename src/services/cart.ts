import { t } from 'i18next';
import { Order as ApiOrderModel } from '@api/model/order';
import { ORDER_STATUS, type EOrderStatus, type IOrderDocument, type IOrderProduct } from '@models/orders';
import type { IUserDocument, ICartItem } from '@models/users';
import type { IProductDocument } from '@models/products';
import type { Order } from '@types';
import { generateReject, generateSuccess, type IResponseReject, type IResponseSuccess } from '@utils/response';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
import { userRepository } from '@repositories/users';
import { orderRepository } from '@repositories/orders';
import { cartItemModel } from '@models/cart-items';
import { productModel } from '@models/products';
import { userTokenModel } from '@models/user-tokens';

type CartProductSnapshot = NonNullable<ICartItem['product']>;
type CartProductObject = Exclude<CartProductSnapshot, number>;
type OrderProductShape = IOrderProduct['product'];

const getUserId = (user: IUserDocument): number => Number(user.id);

const isCartProductObject = (value: unknown): value is CartProductObject => {
    if (typeof value !== 'object' || value === null) return false;

    const candidate = value as Record<string, unknown>;
    const numberOrUndefined = (entry: unknown) => entry === undefined || typeof entry === 'number';
    const stringOrUndefined = (entry: unknown) => entry === undefined || typeof entry === 'string';

    return (
        numberOrUndefined(candidate.id) &&
        numberOrUndefined(candidate.price) &&
        stringOrUndefined(candidate.title) &&
        stringOrUndefined(candidate.description) &&
        stringOrUndefined(candidate.imageUrl) &&
        (candidate.active === undefined || typeof candidate.active === 'boolean')
    );
};

const toCartProduct = (value: unknown, fallbackProductId: number): CartProductSnapshot =>
    isCartProductObject(value) ? value : fallbackProductId;

const updateUserCartTimestamp = (user: IUserDocument) =>
    typeof user.update === 'function'
        ? user.update({ cartUpdatedAt: new Date() })
        : Promise.resolve();

const orderStatusToApi: Record<EOrderStatus, Order['status']> = {
    [ORDER_STATUS.PENDING]: ApiOrderModel.StatusEnum.Pending,
    [ORDER_STATUS.PAID]: ApiOrderModel.StatusEnum.Paid,
    [ORDER_STATUS.PROCESSING]: ApiOrderModel.StatusEnum.Processing,
    [ORDER_STATUS.SHIPPED]: ApiOrderModel.StatusEnum.Shipped,
    [ORDER_STATUS.DELIVERED]: ApiOrderModel.StatusEnum.Delivered,
    [ORDER_STATUS.CANCELLED]: ApiOrderModel.StatusEnum.Cancelled
};

const toOrderResponse = (order: IOrderDocument): Order => {
    const items = order.products.map(({ product, quantity }) => ({
        productId: String(product.id ?? ''),
        quantity
    }));
    const total = order.products.reduce(
        (sum, entry) => sum + Number(entry.product.price ?? 0) * entry.quantity,
        0
    );

    return {
        id: String(order.id),
        userId: String(order.userId),
        email: order.email,
        items,
        total,
        notes: order.notes,
        status: orderStatusToApi[order.status],
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
    };
};

/**
 * Rebuilds the user cart and token relations from normalized SQL tables.
 * This keeps response payloads compatible with the legacy user shape.
 */
const hydrateUserCart = async (user: IUserDocument): Promise<IUserDocument> => {
    const rows = await cartItemModel.findAll({
        where: { userId: getUserId(user) },
        include: [{ model: productModel, as: 'product' }]
    });

    user.cart = {
        items: rows.map((row) => ({
            product: toCartProduct(row.get('product'), Number(row.productId)),
            quantity: Number(row.quantity)
        })),
        updatedAt: user.cartUpdatedAt
    };

    const tokens = await userTokenModel.findAll({
        where: { userId: getUserId(user) },
        raw: true
    });
    user.tokens = tokens.map((token) => ({
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
            const product = typeof item.product === 'number' ? undefined : item.product;
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
        .then(() => updateUserCartTimestamp(user))
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
                quantity: Number(row.quantity) + quantity
            });
        })
        .then(() => updateUserCartTimestamp(user))
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
        .then(() => updateUserCartTimestamp(user))
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
        .then(() => updateUserCartTimestamp(user))
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
                if (typeof entry.product === 'number') {
                    return {
                        product: { id: entry.product },
                        quantity: entry.quantity
                    };
                }

                const product: OrderProductShape = entry.product;
                return {
                    product: {
                        id: product.id === undefined || product.id === null ? undefined : Number(product.id),
                        title: product.title,
                        price: product.price,
                        description: product.description,
                        imageUrl: product.imageUrl,
                        active: product.active
                    },
                    quantity: entry.quantity
                };
            });

            return orderRepository
                .create({
                    userId: getUserId(user),
                    email: user.email,
                    products: mappedProducts
                } as Partial<IOrderDocument>)
                .then((order) =>
                    cartRemove(user).then(() => generateSuccess<Order>(toOrderResponse(order)))
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
