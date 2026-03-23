import { Op, fn, col, literal } from 'sequelize';
import OrderModel from '@models/orders';
import { OrderItemModel } from '@models/orders';
import type { IOrderDocument, IOrderProduct } from '@models/orders';

/**
 * Order Repository
 * Handles all raw database operations for the Order entity.
 * No business logic here — only CRUD operations against Sequelize.
 */

/**
 * Full include option to join order_items when fetching orders
 */
const withItems = {
    include: [{
        model: OrderItemModel,
        as: 'orderItems',
    }],
};

/**
 * Find all orders with optional filter and pagination.
 * Returns model instances with orderItems included.
 *
 * @param options
 */
export const findAll = (
    options: {
        where?: Record<string, unknown>;
        sort?: [string, 'ASC' | 'DESC'][];
        skip?: number;
        limit?: number;
    } = {},
): Promise<IOrderDocument[]> =>
    OrderModel.findAll({
        where: options.where ?? {},
        order: options.sort ?? [['createdAt', 'DESC']],
        offset: options.skip ?? 0,
        limit: options.limit,
        ...withItems,
    });

/**
 * Count orders matching the given filter
 *
 * @param where
 */
export const count = (where: Record<string, unknown> = {}): Promise<number> =>
    OrderModel.count({ where });

/**
 * Create a new order record along with its order items (product snapshots).
 *
 * @param data
 * @param products - array of { product, quantity } to create as OrderItem rows
 */
export const create = async (
    data: { userId: number; email: string },
    products: IOrderProduct[],
): Promise<IOrderDocument> => {
    const order = await OrderModel.create(data);
    // Bulk-create order items (product snapshots)
    const items = products.map(({ product, quantity }) => ({
        orderId: order.id,
        quantity,
        productId: product.id ?? null,
        productTitle: product.title,
        productPrice: product.price,
        productImageUrl: product.imageUrl,
        productDescription: product.description ?? '',
        productActive: product.active ?? false,
    }));
    await OrderItemModel.bulkCreate(items);
    // Reload with items included
    await order.reload({ ...withItems });
    return order;
};

// ---------------------------------------------------------------------------
// Aggregate-style helpers (replacing MongoDB pipeline stages)
// ---------------------------------------------------------------------------

/**
 * Compute totals for a set of orders (totalItems, totalQuantity, totalPrice).
 * Returns a map keyed by orderId.
 *
 * This replaces the MongoDB $addFields aggregation stage.
 */
export const computeOrderTotals = async (
    orderIds: number[],
): Promise<Map<number, { totalItems: number; totalQuantity: number; totalPrice: number }>> => {
    if (orderIds.length === 0) return new Map();

    const rows = await OrderItemModel.findAll({
        where: { orderId: { [Op.in]: orderIds } },
        attributes: [
            'orderId',
            [fn('COUNT', col('id')), 'totalItems'],
            [fn('SUM', col('quantity')), 'totalQuantity'],
            [fn('SUM', literal('`quantity` * `productPrice`')), 'totalPrice'],
        ],
        group: ['orderId'],
        raw: true,
    }) as unknown as {
        orderId: number;
        totalItems: number;
        totalQuantity: number;
        totalPrice: number;
    }[];

    const map = new Map<number, { totalItems: number; totalQuantity: number; totalPrice: number }>();
    for (const row of rows) {
        map.set(Number(row.orderId), {
            totalItems: Number(row.totalItems),
            totalQuantity: Number(row.totalQuantity),
            totalPrice: Number(row.totalPrice),
        });
    }
    return map;
};


export default { findAll, count, create, computeOrderTotals };
