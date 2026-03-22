import { Types } from 'mongoose';
import type { QueryFilter, PipelineStage } from 'mongoose';
import type { SearchOrdersRequest, OrdersResponse, Order } from '@api/api';
import type { IOrderDocument } from '@models/orders';
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
            $size: '$products',
        },
        // Sum quantities from all OrderItems
        totalQuantity: {
            $sum: '$products.quantity',
        },
        // Sum of all prices multiplied for quantity
        totalPrice: {
            $sum: {
                $map: {
                    input: '$products',
                    as: 'product',
                    in: {
                        $multiply: ['$$product.product.price', '$$product.quantity'],
                    },
                },
            },
        },
    },
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
    scope?: QueryFilter<IOrderDocument>,
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
        addComputedFields,
    ];

    const [countAgg] = await OrderRepository.aggregate<{ totalItems?: number }>([
        ...basePipeline,
        { $count: 'totalItems' },
    ]);

    const totalItems = countAgg?.totalItems ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    const items = await OrderRepository.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: pageSize },
    ]);

    return {
        // IOrderDocument[] returned as Order[] — the API type differs from the DB schema
        // (products vs items, userId ObjectId vs string) but the runtime data is compatible
        items: items as unknown as Order[],
        meta: {
            page,
            pageSize,
            totalItems,
            totalPages,
        },
    };
};


export default { getAll, search };
