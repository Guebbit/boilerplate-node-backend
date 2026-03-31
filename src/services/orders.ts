import { Types } from 'mongoose';
import type { PipelineStage } from 'mongoose';
import { t } from 'i18next';
import type { SearchOrdersRequest, OrdersResponse, Order, CartItem } from '../../api/api';
import type { IOrderDocument, IOrderProduct } from '@models/orders';
import { EOrderStatus } from '@models/orders';
import {
    generateReject,
    generateSuccess,
    type IResponseReject,
    type IResponseSuccess
} from '@utils/response';
import ProductRepository from '@repositories/products';
import OrderRepository from '@repositories/orders';

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

/**
 * Get all orders with optional aggregation pipeline stages.
 * Adds computed fields: totalItems, totalQuantity, totalPrice.
 *
 * @param pipeline - Optional stages to apply BEFORE the computed fields stage
 */
export const getAll = (pipeline: PipelineStage[] = []): Promise<IOrderDocument[]> =>
    OrderRepository.aggregate([...pipeline, addComputedFields]);

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
export const search = async (
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

    const [countAgg] = await OrderRepository.aggregate<{ totalItems?: number }>([
        ...basePipeline,
        { $count: 'totalItems' }
    ]);

    const totalItems = countAgg?.totalItems ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    const items = await OrderRepository.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: pageSize }
    ]);

    return {
        // IOrderDocument[] returned as Order[] — the API type differs from the DB schema
        // (products vs items, userId ObjectId vs string) but the runtime data is compatible
        items: items as unknown as Order[],
        meta: {
            page,
            pageSize,
            totalItems,
            totalPages
        }
    };
};

/**
 * Get a single order by ID.
 * Returns undefined if id is falsy, or null if not found.
 *
 * @param id
 * @param scope - Optional extra filter (e.g. restrict to a specific userId)
 */
export const getById = async (
    id: string | undefined,
    scope?: Record<string, unknown>
): Promise<IOrderDocument | null | undefined> => {
    if (!id) return;
    if (scope) {
        // Use aggregate so we can apply both _id and scope filters
        const [result] = await OrderRepository.aggregate([
            {
                $match: { _id: new Types.ObjectId(id), ...scope } as Record<string, unknown>
            },
            { $limit: 1 },
            addComputedFields
        ]);
        return result ?? undefined;
    }
    return OrderRepository.findById(id);
};

/**
 * Create a new order from a list of { productId, quantity } items.
 * Looks up each product and stores a full snapshot in the order document.
 *
 * @param userId
 * @param email
 * @param items - Array of { productId, quantity }
 */
export const create = async (
    userId: string,
    email: string,
    items: CartItem[]
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> => {
    if (!items || items.length === 0)
        return generateReject(422, 'create order - empty items', [t('generic.error-missing-data')]);

    const products: IOrderProduct[] = [];

    for (const item of items) {
        const product = await ProductRepository.findById(item.productId).lean();
        if (!product)
            return generateReject(404, 'create order - product not found', [
                t('ecommerce.product-not-found')
            ]);
        products.push({
            product,
            quantity: item.quantity
        } as unknown as IOrderProduct);
    }

    const order = await OrderRepository.create({
        userId: new Types.ObjectId(userId),
        email,
        products
    } as Partial<IOrderDocument>);

    return generateSuccess(order, 201, t('ecommerce.order-creation-success'));
};

/**
 * Update an existing order by ID (admin).
 * Only updates the fields provided.
 *
 * @param id
 * @param data
 */
export const update = async (
    id: string,
    data: {
        status?: string;
        email?: string;
        userId?: string;
        items?: CartItem[];
    }
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> => {
    const order = await OrderRepository.findById(id);
    if (!order) return generateReject(404, '404', [t('ecommerce.order-not-found')]);

    if (data.status !== undefined) order.status = data.status as EOrderStatus;
    if (data.email !== undefined) order.email = data.email;
    if (data.userId !== undefined) order.userId = new Types.ObjectId(data.userId);

    if (data.items && data.items.length > 0) {
        const products: IOrderProduct[] = [];
        for (const item of data.items) {
            const product = await ProductRepository.findById(item.productId).lean();
            if (!product)
                return generateReject(404, 'update order - product not found', [
                    t('ecommerce.product-not-found')
                ]);
            products.push({
                product,
                quantity: item.quantity
            } as unknown as IOrderProduct);
        }
        order.products = products;
    }

    const saved = await OrderRepository.save(order);
    return generateSuccess(saved);
};

/**
 * Delete an order by ID (hard delete).
 *
 * @param id
 */
export const remove = async (
    id: string
): Promise<IResponseSuccess<undefined> | IResponseReject> => {
    const order = await OrderRepository.findById(id);
    if (!order) return generateReject(404, '404', [t('ecommerce.order-not-found')]);

    await OrderRepository.deleteOne(order);
    return generateSuccess(undefined, 200, t('ecommerce.order-deleted'));
};

export default { getAll, search, getById, create, update, remove };
