import { WhereOptions } from 'sequelize';
import { Order } from '../models/orders';
import { User } from '../models/users';
import type { CreateOrderInput, UpdateOrderInput, SearchOrderInput, OrderItem } from '../models/orders';
import type { PaginationMeta } from '../types/index';

// ─── Order Repository ─────────────────────────────────────────────────────────

export interface FindAllOrdersResult {
  rows: Order[];
  meta: PaginationMeta;
}

export const orderRepository = {
  async findById(id: string): Promise<Order | null> {
    return Order.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'email', 'username'] }],
    });
  },

  async findAll(filters: SearchOrderInput): Promise<FindAllOrdersResult> {
    const { page, limit, userId, status } = filters;
    const offset = (page - 1) * limit;

    const where: WhereOptions = {};
    if (userId) where['userId'] = userId;
    if (status) where['status'] = status;

    const { rows, count } = await Order.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'user', attributes: ['id', 'email', 'username'] }],
    });

    return {
      rows,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  },

  async create(userId: string, data: CreateOrderInput): Promise<Order> {
    const totalAmount = data.items.reduce(
      (sum: number, item: OrderItem) => sum + item.unitPrice * item.quantity,
      0,
    );
    return Order.create({
      userId,
      items: data.items,
      totalAmount,
      notes: data.notes,
    });
  },

  async update(id: string, data: UpdateOrderInput): Promise<Order | null> {
    const order = await Order.findByPk(id);
    if (!order) return null;
    return order.update(data);
  },

  async remove(id: string): Promise<boolean> {
    const deleted = await Order.destroy({ where: { id } });
    return deleted > 0;
  },
};
