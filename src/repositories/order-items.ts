import OrderItemModel from '@models/order-items';
import type { IOrderItem } from '@models/order-items';

/**
 * OrderItem Repository
 * Handles order item persistence operations.
 */
export const findByOrderId = (orderId: number): Promise<OrderItemModel[]> =>
    OrderItemModel.findAll({ where: { orderId } });

export const create = (data: Partial<IOrderItem>): Promise<OrderItemModel> =>
    OrderItemModel.create(data as IOrderItem);

export default { findByOrderId, create };
