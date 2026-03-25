import { Types } from 'mongoose';
import type { FilterQuery as QueryFilter, PipelineStage } from 'mongoose';
import type { SearchOrdersRequest, OrdersResponse, Order } from '@api/api';
import type { IOrderDocument, IOrderProduct } from '@models/orders';
import { generateReject, generateSuccess, type IResponseReject, type IResponseSuccess } from '@utils/response';
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


/**
 * Get a single order by ID.
 * Returns undefined if id is falsy; null if no matching document is found.
 *
 * @param id
 */
export const getById = async (id?: string): Promise<IOrderDocument | undefined | null> => {
    if (!id)
        return;
    return OrderRepository.findById(id);
};

/**
 * Create a new order document (admin version — direct, without cart).
 * Items is an array of { productId, quantity }; we store them as embedded product stubs.
 *
 * @param data
 */
export const adminCreate = async (data: {
    userId: string;
    email: string;
    items: Array<{ productId: string; quantity: number }>;
    status?: string;
    notes?: string;
}): Promise<IOrderDocument> => {
    const products: IOrderProduct[] = data.items.map(item => ({
        product: { _id: new Types.ObjectId(item.productId), price: 0 } as unknown as IOrderProduct['product'],
        quantity: item.quantity,
    }));
    return OrderRepository.create({
        userId: new Types.ObjectId(data.userId),
        email: data.email,
        products,
        status: data.status ?? 'pending',
        notes: data.notes,
    } as Partial<IOrderDocument>);
};

/**
 * Update an existing order by ID (admin version).
 *
 * @param id
 * @param data
 */
export const adminUpdate = async (
    id: string,
    data: {
        status?: string;
        userId?: string;
        email?: string;
        items?: Array<{ productId: string; quantity: number }>;
        notes?: string;
    },
): Promise<IOrderDocument> => {
    const order = await OrderRepository.findById(id);

    if (!order)
        throw new Error('404');

    if (data.status !== undefined) order.status = data.status;
    if (data.email !== undefined) order.email = data.email;
    if (data.userId !== undefined) order.userId = new Types.ObjectId(data.userId);
    if (data.notes !== undefined) order.notes = data.notes;
    if (data.items !== undefined) {
        order.products = data.items.map(item => ({
            product: { _id: new Types.ObjectId(item.productId), price: 0 } as unknown as IOrderProduct['product'],
            quantity: item.quantity,
        }));
    }

    return OrderRepository.save(order);
};

/**
 * Hard-delete an order by ID.
 *
 * @param id
 */
export const remove = async (
    id: string,
): Promise<IResponseSuccess<undefined> | IResponseReject> => {
    const order = await OrderRepository.findById(id);

    if (!order)
        return generateReject(404, '404', ['Order not found']);

    return OrderRepository.deleteOne(order)
        .then(() => generateSuccess(undefined, 200, 'Order deleted'));
};


export default { getAll, search, getById, adminCreate, adminUpdate, remove };
