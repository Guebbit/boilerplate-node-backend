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

/** Normalizes a user identifier to a number. */
const getUserId = (user: IUserDocument): number => Number(user.id);

/** Type guard for cart product snapshots stored as objects. */
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

/** Returns a cart product object when available, otherwise uses product id fallback. */
const toCartProduct = (value: unknown, fallbackProductId: number): CartProductSnapshot =>
    isCartProductObject(value) ? value : fallbackProductId;

/** Validates that order product snapshots contain required title/price fields. */
const hasRequiredOrderProductFields = (
    value: Partial<OrderProductShape>
): value is Partial<OrderProductShape> & Pick<OrderProductShape, 'title' | 'price'> =>
    typeof value.title === 'string' && typeof value.price === 'number';

/** Updates cart timestamp when persistence layer supports update operations. */
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

/** Maps an order document to API order response format. */
const toOrderResponse = (order: IOrderDocument): Order => {
    const items = order.products.map(({ product, quantity }) => ({
        product: {
            id: String(product.id ?? ''),
            title: product.title,
            price: product.price,
            description: product.description,
            imageUrl: product.imageUrl,
            active: product.active
        },
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
const hydrateUserCart = (user: IUserDocument): Promise<IUserDocument> =>
    cartItemModel
        .findAll({
            where: { userId: getUserId(user) },
            include: [{ model: productModel, as: 'product' }]
        })
        .then((rows) => {
            user.cart = {
                items: rows.map((row) => ({
                    product: toCartProduct(row.get('product'), Number(row.productId)),
                    quantity: Number(row.quantity)
                })),
                updatedAt: user.cartUpdatedAt
            };

            return userTokenModel.findAll({
                where: { userId: getUserId(user) },
                raw: true
            });
        })
        .then((tokens) => {
            user.tokens = tokens.map((token) => ({
                type: token.type,
                token: token.token,
                expiration: token.expiration ?? undefined
            }));

            return user;
        });

/** Returns cart items for a user after relation hydration. */
export const cartGet = (user: IUserDocument): Promise<ICartItem[]> =>
    hydrateUserCart(user).then((u) => (u.cart?.items ?? []) as ICartItem[]);

/** Returns cart items plus derived quantity and total summary values. */
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

/** Sets an absolute quantity for a product in the user cart. */
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

/** Sets cart quantity using a product entity reference. */
export const cartItemSet = (
    user: IUserDocument,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> => cartItemSetById(user, String(product.id), quantity);

/** Adds quantity for a cart item, creating the item when absent. */
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

/** Adds quantity using a product entity reference. */
export const cartItemAdd = (
    user: IUserDocument,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> => cartItemAddById(user, String(product.id), quantity);

/** Removes one cart item by product id. */
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

/** Removes one cart item using a product entity reference. */
export const cartItemRemove = (
    user: IUserDocument,
    product: IProductDocument
): Promise<IResponseSuccess<IUserDocument>> => cartItemRemoveById(user, String(product.id));

/** Clears all cart items for a user. */
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
                if (typeof entry.product === 'number') return { isValid: false as const };

                const product = entry.product as Partial<OrderProductShape>;
                if (!hasRequiredOrderProductFields(product)) return { isValid: false as const };
                return {
                    isValid: true as const,
                    value: {
                        product: {
                            id: product.id === undefined ? undefined : String(product.id),
                            title: product.title,
                            price: product.price,
                            description: product.description,
                            imageUrl: product.imageUrl,
                            active: product.active
                        },
                        quantity: entry.quantity
                    },
                };
            });

            const orderProducts: IOrderProduct[] = [];
            for (const entry of mappedProducts) {
                if (!entry.isValid)
                    return generateReject(422, 'order confirm - snapshot product data required', [
                        t('generic.error-invalid-data')
                    ]);
                orderProducts.push(entry.value);
            }

            return orderRepository
                .create({
                    userId: getUserId(user),
                    email: user.email,
                    products: orderProducts
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
