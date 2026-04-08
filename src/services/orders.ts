import { Types } from 'mongoose';
import type { PipelineStage } from 'mongoose';
import { t } from 'i18next';
import type { SearchOrdersRequest, OrdersResponse, Order, CartItem, OrderItem } from '@types';
import type { IOrderDocument, IOrderProduct } from '@models/orders';
import { EOrderStatus } from '@models/orders';
import {
    generateReject,
    generateSuccess,
    type IResponseReject,
    type IResponseSuccess
} from '@utils/response';
import { productRepository } from '@repositories/products';
import { orderRepository } from '@repositories/orders';

/**
 * Order Service
 * Handles all business logic for the Order entity.
 * Delegates raw database access to Order Repository.
 */

/**
 * Computed fields pipeline stage — shared between getAll and search.
 * Adds totalItems, totalQuantity and totalPrice to every order document.
 */
const addComputedFields: PipelineStage.AddFields = {
    $addFields: {
        // Count all OrderItems
        totalItems: {
            $size: '$products'
        },
        // Sum quantities from all OrderItems
        totalQuantity: {
            $sum: '$products.quantity'
        },
        // Sum of all prices multiplied for quantity
        totalPrice: {
            $sum: {
                $map: {
                    input: '$products',
                    as: 'product',
                    in: {
                        $multiply: ['$$product.product.price', '$$product.quantity']
                    }
                }
            }
        }
    }
};

const isCartItem = (item: CartItem | OrderItem): item is CartItem =>
    'productId' in (item as CartItem);

const normalizeSnapshotProduct = (product: OrderItem['product']): IOrderProduct['product'] => {
    const { id, ...snapshot } = product as unknown as Record<string, unknown>;
    const normalizedSnapshot =
        !('_id' in snapshot) && typeof id === 'string' && Types.ObjectId.isValid(id)
            ? {
                  ...snapshot,
                  _id: new Types.ObjectId(id)
              }
            : snapshot;

    return normalizedSnapshot as unknown as IOrderProduct['product'];
};

const resolveOrderProducts = (
    items: Array<CartItem | OrderItem>
): Promise<IOrderProduct[] | IResponseReject> =>
    Promise.all(
        items.map((item) => {
            if (isCartItem(item))
                return productRepository
                    .findById(item.productId)
                    .lean()
                    .then((product) => ({ item, product, source: 'cart' as const }));

            return Promise.resolve({
                item,
                product: normalizeSnapshotProduct(item.product),
                source: 'snapshot' as const
            });
        })
    ).then((resolvedItems) => {
        const missingProduct = resolvedItems.some(({ product, source }) => source === 'cart' && !product);
        if (missingProduct)
            return generateReject(404, 'create order - product not found', [
                t('ecommerce.product-not-found')
            ]);

        return resolvedItems.map(
            ({ item, product }) =>
                ({
                    product: product as IOrderProduct['product'],
                    quantity: item.quantity
                }) as IOrderProduct
        );
    });

/**
 * Get all orders with optional aggregation pipeline stages.
 * Adds computed fields: totalItems, totalQuantity, totalPrice.
 *
 * @param pipeline - Optional stages to apply BEFORE the computed fields stage
 */
export const getAll = (pipeline: PipelineStage[] = []): Promise<IOrderDocument[]> =>
    orderRepository.aggregate([...pipeline, addComputedFields]);

/**
 * Search orders (DTO-friendly) — matches POST /orders/search in OpenAPI.
 *
 * Filters: id, userId, productId, email
 * Pagination: page (1-based), pageSize
 *
 * Note on productId:
 * In this schema product data is embedded: products[].product.
 * We filter by products.product._id (or products.product.id if your productSchema uses that).
 *
 * @param search
 * @param scope - Additional query filters merged into the $match stage
 */
export const search = (
    search: SearchOrdersRequest = {},
    scope?: Record<string, unknown>
): Promise<OrdersResponse> => {
    const page = Math.max(1, Number(search.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(search.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    const match: Record<string, unknown> = { ...scope };

    if (search.id && String(search.id).trim() !== '')
        match._id = new Types.ObjectId(String(search.id));

    if (search.userId && String(search.userId).trim() !== '')
        match.userId = new Types.ObjectId(String(search.userId));

    if (search.email && String(search.email).trim() !== '')
        match.email = String(search.email).trim();

    if (search.productId && String(search.productId).trim() !== '')
        // Assumes productSchema uses default _id. If you store product.id instead, change to "products.product.id".
        match['products.product._id'] = new Types.ObjectId(String(search.productId));

    const basePipeline: PipelineStage[] = [
        { $match: match },
        { $sort: { createdAt: -1 } },
        addComputedFields
    ];

    return orderRepository
        .aggregate<{ totalItems?: number }>([...basePipeline, { $count: 'totalItems' }])
        .then(([countAgg]) => {
            const totalItems = countAgg?.totalItems ?? 0;
            const totalPages = Math.ceil(totalItems / pageSize);

            return orderRepository
                .aggregate([...basePipeline, { $skip: skip }, { $limit: pageSize }])
                .then((items) => ({
                    // IOrderDocument[] returned as Order[] — the API type differs from the DB schema
                    // (products vs items, userId ObjectId vs string) but the runtime data is compatible
                    items: items as unknown as Order[],
                    meta: {
                        page,
                        pageSize,
                        totalItems,
                        totalPages
                    }
                }));
        });
};

/**
 * Get a single order by ID.
 * Returns undefined if id is falsy, or null if not found.
 *
 * @param id
 * @param scope - Optional extra filter (e.g. restrict to a specific userId)
 */
export const getById = (
    id: string | undefined,
    scope?: Record<string, unknown>
): Promise<IOrderDocument | null | void> => {
    if (!id) return Promise.resolve();
    if (scope) {
        // Use aggregate so we can apply both _id and scope filters
        return orderRepository
            .aggregate([
                {
                    $match: { _id: new Types.ObjectId(id), ...scope } as Record<string, unknown>
                },
                { $limit: 1 },
                addComputedFields
            ])
            .then(([result]) => result ?? undefined);
    }
    return orderRepository.findById(id);
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
    items: Array<CartItem | OrderItem>
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> => {
    if (!items || items.length === 0)
        return Promise.resolve(
            generateReject(422, 'create order - empty items', [t('generic.error-missing-data')])
        );

    return resolveOrderProducts(items).then((productsOrReject) => {
        if (!Array.isArray(productsOrReject)) return productsOrReject;
        const products = productsOrReject;

        return orderRepository
            .create({
                userId: new Types.ObjectId(userId),
                email,
                products
            } as Partial<IOrderDocument>)
            .then((order) => generateSuccess(order, 201, t('ecommerce.order-creation-success')));
    });
};

/**
 * Update an existing order by ID (admin).
 * Only updates the fields provided.
 *
 * @param id
 * @param data
 */
export const update = (
    id: string,
    data: {
        status?: string;
        email?: string;
        userId?: string;
        items?: Array<CartItem | OrderItem>;
    }
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> => {
    return orderRepository.findById(id).then((order) => {
        if (!order) return generateReject(404, '404', [t('ecommerce.order-not-found')]);

        if (data.status !== undefined) order.status = data.status as EOrderStatus;
        if (data.email !== undefined) order.email = data.email;
        if (data.userId !== undefined) order.userId = new Types.ObjectId(data.userId);

        const updateProductsPromise: Promise<IResponseReject | void> =
            data.items && data.items.length > 0
                ? resolveOrderProducts(data.items).then((productsOrReject) => {
                      if (!Array.isArray(productsOrReject)) return productsOrReject;

                      order.products = productsOrReject;
                  })
                : Promise.resolve();

        return updateProductsPromise.then((earlyResult) => {
            if (earlyResult) return earlyResult;
            return orderRepository.save(order).then((saved) => generateSuccess(saved));
        });
    });
};

/**
 * Delete an order by ID (hard delete).
 *
 * @param id
 */
export const remove = (id: string): Promise<IResponseSuccess<undefined> | IResponseReject> => {
    return orderRepository.findById(id).then((order) => {
        if (!order) return generateReject(404, '404', [t('ecommerce.order-not-found')]);
        return orderRepository
            .deleteOne(order)
            .then(() => generateSuccess(undefined, 200, t('ecommerce.order-deleted')));
    });
};

export const orderService = { getAll, search, getById, create, update, remove };
