import { orderRepository } from '../repositories/orders';
import type { FindAllOrdersResult } from '../repositories/orders';
import type { CreateOrderInput, UpdateOrderInput, SearchOrderInput } from '../models/orders';
import { Order } from '../models/orders';
import { AppError } from './users';
import { productService } from './products';
import { OrderStatus } from '../types/index';

// ─── Order Service ────────────────────────────────────────────────────────────

export const orderService = {
  async getById(id: string): Promise<Order> {
    const order = await orderRepository.findById(id);
    if (!order) throw new AppError('Order not found', 404);
    return order;
  },

  async search(filters: SearchOrderInput): Promise<FindAllOrdersResult> {
    return orderRepository.findAll(filters);
  },

  async create(userId: string, data: CreateOrderInput): Promise<Order> {
    for (const item of data.items) {
      await productService.decrementStock(item.productId, item.quantity);
    }
    return orderRepository.create(userId, data);
  },

  async updateStatus(id: string, data: UpdateOrderInput): Promise<Order> {
    const existing = await orderRepository.findById(id);
    if (!existing) throw new AppError('Order not found', 404);

    if (
      existing.status === OrderStatus.DELIVERED ||
      existing.status === OrderStatus.CANCELLED
    ) {
      throw new AppError(`Cannot update an order with status "${existing.status}"`, 400);
    }

    const order = await orderRepository.update(id, data);
    if (!order) throw new AppError('Order not found', 404);
    return order;
  },

  async cancel(id: string): Promise<Order> {
    return this.updateStatus(id, { status: OrderStatus.CANCELLED });
  },

  async remove(id: string): Promise<void> {
    const deleted = await orderRepository.remove(id);
    if (!deleted) throw new AppError('Order not found', 404);
  },
};
