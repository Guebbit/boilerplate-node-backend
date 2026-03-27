import OrderModel, { OrderItemModel } from '@models/orders';
import type { IOrder, IOrderItem } from '@models/orders';
import type { WhereOptions } from 'sequelize';
import { sequelize } from '@utils/database';
import { QueryTypes } from 'sequelize';

/**
 * Order Repository
 * Handles all raw database operations for the Order entity.
 * No business logic here — only CRUD operations against Sequelize.
 */

/**
 * Find an order by its ID with all order items
 *
 * @param id
 */
export const findById = (id: string | number): Promise<OrderModel | null> =>
    OrderModel.findByPk(id, {
        include: [{ model: OrderItemModel, as: 'orderItems' }],
    });

/**
 * Find all orders matching the given query with items included
 *
 * @param where
 */
export const findAll = (where: WhereOptions<IOrder> = {}): Promise<OrderModel[]> =>
    OrderModel.findAll({
        where,
        include: [{ model: OrderItemModel, as: 'orderItems' }],
        order: [['createdAt', 'DESC']],
    });

/**
 * Create a new order with its items
 *
 * @param orderData Order data without items
 * @param items Array of order items
 */
export const create = async (
    orderData: Partial<IOrder>,
    items: Partial<IOrderItem>[],
): Promise<OrderModel> => {
    const transaction = await sequelize.transaction();
    try {
        // Create the order
        const order = await OrderModel.create(orderData as IOrder, { transaction });

        // Create order items
        const orderItems = items.map((item) => ({
            ...item,
            orderId: order.id,
        }));
        await OrderItemModel.bulkCreate(orderItems as IOrderItem[], { transaction });

        await transaction.commit();

        // Fetch the complete order with items
        return await findById(order.id) as OrderModel;
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/**
 * Get order statistics for a user
 * Replaces MongoDB aggregation with SQL query
 *
 * @param userId
 */
export const getOrderStats = async (userId: number): Promise<{
    totalOrders: number;
    totalItems: number;
    totalQuantity: number;
    totalPrice: number;
}[]> => {
    const results = await sequelize.query<{
        totalOrders: number;
        totalItems: number;
        totalQuantity: number;
        totalPrice: number;
    }>(
        `
        SELECT
            COUNT(DISTINCT o.id) as totalOrders,
            COUNT(oi.id) as totalItems,
            COALESCE(SUM(oi.quantity), 0) as totalQuantity,
            COALESCE(SUM(oi.price * oi.quantity), 0) as totalPrice
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.orderId
        WHERE o.userId = :userId
        `,
        {
            replacements: { userId },
            type: QueryTypes.SELECT,
        },
    );

    return results;
};

/**
 * Get all orders with computed totals
 * Replaces MongoDB aggregation pipeline
 *
 * @param where
 */
export const getOrdersWithTotals = async (where: WhereOptions<IOrder> = {}): Promise<Record<string, unknown>[]> => {
    const whereClause = where.userId ? `WHERE o.userId = ${String(where.userId)}` : '';

    const results = await sequelize.query<Record<string, unknown>>(
        `
        SELECT
            o.id,
            o.userId,
            o.email,
            o.createdAt,
            o.updatedAt,
            COUNT(oi.id) as totalItems,
            COALESCE(SUM(oi.quantity), 0) as totalQuantity,
            COALESCE(SUM(oi.price * oi.quantity), 0) as totalPrice,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', oi.id,
                    'productId', oi.productId,
                    'title', oi.title,
                    'price', oi.price,
                    'description', oi.description,
                    'imageUrl', oi.imageUrl,
                    'quantity', oi.quantity
                )
            ) as products
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.orderId
        ${whereClause}
        GROUP BY o.id, o.userId, o.email, o.createdAt, o.updatedAt
        ORDER BY o.createdAt DESC
        `,
        {
            type: QueryTypes.SELECT,
        },
    );

    return results;
};


export default { findById, findAll, create, getOrderStats, getOrdersWithTotals };
