import { t } from '@core/i18n';
import type { SearchOrdersRequest, CartItem, OrderStatus } from '@types';
import type { IOrderDocument, IOrderDocumentItem } from '@models/orders';
import {
    generateReject,
    generateSuccess,
    type IResponseReject,
    type IResponseSuccess
} from '@core/http/response';
import { productRepository } from '@repositories/products';
import { orderRepository } from '@repositories/orders';
// `userId` is stored as an ObjectId, so writes have to coerce it. The rule (and its failure
// mode on a malformed id) lives in the repository layer; this is the only import of it here.
import { toObjectId } from '@repositories/base';

/**
 * Order Service
 * Handles all business logic for the Order entity.
 * Delegates raw database access to Order Repository.
 */

/**
 * Search orders (DTO-friendly) — matches POST /orders/search in OpenAPI.
 *
 * Filters: id, userId, productId, email
 * Pagination: page (1-based), pageSize
 *
 * Note on productId:
 * In this schema product data is embedded: items[].product.
 * We filter by items.product._id (or items.product.id if your productSchema uses that).
 *
 * @param search
 * @param scope - Additional query filters merged into the $match stage
 */
export const search = (
    search: SearchOrdersRequest = {},
    scope?: Record<string, unknown>
): Promise<{
    items: IOrderDocument[];
    meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
}> => orderRepository.search(search, scope);

/**
 * Get a single order by ID.
 * Returns undefined if id is falsy or if not found.
 *
 * @param id
 * @param scope - Optional extra filter (e.g. restrict to a specific userId)
 */
export const getById = (
    id: string | undefined,
    scope?: Record<string, unknown>
): Promise<IOrderDocument | undefined> => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    if (!id) return Promise.resolve<IOrderDocument | undefined>(undefined);
    return orderRepository.findByIdScoped(id, scope);
};

/**
 * Create a new order from a list of { productId, quantity } items.
 * Looks up each product and stores a full snapshot in the order document.
 *
 * @param userId
 * @param email
 * @param items - Array of { productId, quantity }
 */
export const create = (
    userId: string,
    email: string,
    items: CartItem[]
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> => {
    if (!items || items.length === 0)
        return Promise.resolve(
            generateReject(422, 'create order - empty items', [t('generic.error-missing-data')])
        );

    return Promise.all(
        items.map((item) =>
            productRepository.findByIdRaw(item.productId).then((product) => ({ item, product }))
        )
    ).then((resolvedItems) => {
        const missingProduct = resolvedItems.some(({ product }) => !product);
        if (missingProduct)
            return generateReject(404, 'create order - product not found', [
                t('ecommerce.product-not-found')
            ]);

        const orderItems: IOrderDocumentItem[] = resolvedItems.map(({ item, product }) => ({
            // lean() returns a plain object compatible with IProductDocument at runtime
            product: product! as IOrderDocumentItem['product'],
            quantity: item.quantity
        }));

        return orderRepository
            .create({
                userId: toObjectId(userId),
                email,
                items: orderItems
            } as Partial<IOrderDocument>)
            .then((order) => generateSuccess(order, 201, t('ecommerce.order-creation-success')));
    });
};

/**
 * Update an existing order document (admin).
 * Only updates the fields provided.
 *
 * @param order
 * @param data
 */
export const update = (
    order: IOrderDocument,
    data: {
        status?: string;
        email?: string;
        userId?: string;
        items?: CartItem[];
    }
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> => {
    if (data.status !== undefined) order.status = data.status as OrderStatus;
    if (data.email !== undefined) order.email = data.email;
    if (data.userId !== undefined) order.userId = toObjectId(data.userId);

    const updateItemsPromise =
        data.items && data.items.length > 0
            ? Promise.all(
                  data.items.map((item) =>
                      productRepository
                          .findByIdRaw(item.productId)
                          .then((product) => ({ item, product }))
                  )
              ).then((resolvedItems) => {
                  const missingProduct = resolvedItems.some(({ product }) => !product);
                  if (missingProduct)
                      return generateReject(404, 'update order - product not found', [
                          t('ecommerce.product-not-found')
                      ]);

                  order.items = resolvedItems.map(({ item, product }) => ({
                      // lean() returns a plain object compatible with IProductDocument at runtime
                      product: product! as IOrderDocumentItem['product'],
                      quantity: item.quantity
                  }));
              })
            : Promise.resolve();

    return updateItemsPromise.then((earlyResult) => {
        if (earlyResult) return earlyResult;
        return orderRepository.save(order).then((saved) => generateSuccess(saved));
    });
};

/**
 * Update an existing order by ID (admin).
 * Fetches the document then delegates to update().
 *
 * @param id
 * @param data
 */
export const updateById = (
    id: string,
    data: {
        status?: string;
        email?: string;
        userId?: string;
        items?: CartItem[];
    }
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> =>
    orderRepository.findById(id).then((order) => {
        if (!order) return generateReject(404, 'Not Found', [t('ecommerce.order-not-found')]);
        return update(order, data);
    });

/**
 * Delete an order document (hard delete).
 *
 * @param order
 */
export const remove = (
    order: IOrderDocument
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    orderRepository
        .deleteOne(order)
        .then(() => generateSuccess(undefined, 200, t('ecommerce.order-deleted')));

/**
 * Delete an order by ID (hard delete).
 * Fetches the document then delegates to remove().
 *
 * @param id
 */
export const removeById = (id: string): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    orderRepository.findById(id).then((order) => {
        if (!order) return generateReject(404, 'Not Found', [t('ecommerce.order-not-found')]);
        return remove(order);
    });

/**
 * Which orders a caller is allowed to read.
 *
 * The authorization boundary for order reads: the difference between a user seeing their own
 * orders and seeing everyone's. Returns `undefined` for admins, meaning "no restriction", so
 * callers must spread it (`{ ...callerScope(ctx), status: 'paid' }`) rather than treat it as a
 * filter.
 *
 * Takes the auth context rather than the express `Request`: this is a domain rule about a
 * caller, not about a request, and the narrower argument is what lets it live below the HTTP
 * layer: a database filter has no business in `src/core/**`, which the `no-restricted-imports`
 * rule enforces.
 *
 * The `?? ''` is deliberate: an empty string is not a valid ObjectId, so `ownerScope` throws.
 * That is the safe direction — a request with no auth context errors out instead of quietly
 * widening the scope to every user's data.
 */
export const callerScope = (
    authContext?: { id?: string; admin?: boolean } | undefined
): Record<string, unknown> | undefined =>
    authContext?.admin ? undefined : orderRepository.ownerScope(authContext?.id ?? '');

export const orderService = {
    search,
    getById,
    callerScope,
    create,
    update,
    updateById,
    remove,
    removeById
};
