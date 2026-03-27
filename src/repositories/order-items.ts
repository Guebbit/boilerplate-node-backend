import { OrderItemModel } from '@models/orders';
import type { IOrderItem } from '@models/orders';

/**
 * OrderItem Repository
 * Handles all raw database operations for OrderItem.
 */

export const findByOrderId = (orderId: number): Promise<OrderItemModel[]> =>
    OrderItemModel.findAll({ where: { orderId } });

export const create = (data: Partial<IOrderItem>): Promise<OrderItemModel> =>
    OrderItemModel.create(data as IOrderItem);


export default { findByOrderId, create };
