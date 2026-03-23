import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Set test environment before imports
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-key-for-testing-purposes';

import { sequelize } from '../../../src/config/database';
import { User } from '../../../src/models/users';
import { Product } from '../../../src/models/products';
import { Order } from '../../../src/models/orders';
import { UserRole, OrderStatus } from '../../../src/types/index';
import { orderRepository } from '../../../src/repositories/orders';

describe('orderRepository', () => {
  let testUserId: string;
  let testProductId: string;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const user = await User.create({
      email: 'order-repo-test@example.com',
      password: 'Password123!',
      username: 'orderrepouser',
      role: UserRole.USER,
    });
    testUserId = user.id;

    const product = await Product.create({
      name: 'Test Product',
      price: 50,
      stock: 100,
    });
    testProductId = product.id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await Order.destroy({ where: {}, truncate: true });
  });

  const makeOrderData = () => ({
    items: [{ productId: testProductId, quantity: 2, unitPrice: 50 }],
    notes: 'Test order',
  });

  // ─── findById ─────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns an order with user when found', async () => {
      const created = await orderRepository.create(testUserId, makeOrderData());
      const found = await orderRepository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.user).toBeDefined();
    });

    it('returns null when not found', async () => {
      const found = await orderRepository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated orders', async () => {
      await orderRepository.create(testUserId, makeOrderData());
      await orderRepository.create(testUserId, makeOrderData());

      const result = await orderRepository.findAll({ page: 1, limit: 10 });
      expect(result.rows.length).toBe(2);
      expect(result.meta.total).toBe(2);
    });

    it('filters by userId', async () => {
      // Create another user
      const user2 = await User.create({
        email: `other-user-${Date.now()}@example.com`,
        password: 'Password123!',
        username: 'otheruser2',
        role: UserRole.USER,
      });

      await orderRepository.create(testUserId, makeOrderData());
      await orderRepository.create(user2.id, makeOrderData());

      const result = await orderRepository.findAll({ page: 1, limit: 10, userId: testUserId });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].userId).toBe(testUserId);
    });

    it('filters by status', async () => {
      const order = await orderRepository.create(testUserId, makeOrderData());
      await orderRepository.update(order.id, { status: OrderStatus.PROCESSING });
      await orderRepository.create(testUserId, makeOrderData()); // pending

      const result = await orderRepository.findAll({ page: 1, limit: 10, status: OrderStatus.PROCESSING });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe(OrderStatus.PROCESSING);
    });

    it('respects pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await orderRepository.create(testUserId, makeOrderData());
      }

      const page1 = await orderRepository.findAll({ page: 1, limit: 2 });
      expect(page1.rows.length).toBe(2);
      expect(page1.meta.totalPages).toBe(3);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates an order and calculates totalAmount correctly', async () => {
      const data = {
        items: [
          { productId: testProductId, quantity: 3, unitPrice: 25 },
          { productId: testProductId, quantity: 2, unitPrice: 10 },
        ],
      };

      const order = await orderRepository.create(testUserId, data);
      expect(order.id).toBeDefined();
      expect(order.userId).toBe(testUserId);
      expect(Number(order.totalAmount)).toBeCloseTo(95); // 3*25 + 2*10 = 95
      expect(order.status).toBe(OrderStatus.PENDING);
    });

    it('stores items correctly', async () => {
      const order = await orderRepository.create(testUserId, makeOrderData());
      const items = order.items as Array<{ productId: string; quantity: number; unitPrice: number }>;
      expect(items.length).toBe(1);
      expect(items[0].quantity).toBe(2);
      expect(items[0].unitPrice).toBe(50);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates an order and returns the updated record', async () => {
      const order = await orderRepository.create(testUserId, makeOrderData());
      const updated = await orderRepository.update(order.id, { status: OrderStatus.SHIPPED });

      expect(updated).not.toBeNull();
      expect(updated?.status).toBe(OrderStatus.SHIPPED);
    });

    it('returns null when order not found', async () => {
      const result = await orderRepository.update('00000000-0000-0000-0000-000000000000', { status: OrderStatus.SHIPPED });
      expect(result).toBeNull();
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes an order and returns true', async () => {
      const order = await orderRepository.create(testUserId, makeOrderData());
      const result = await orderRepository.remove(order.id);

      expect(result).toBe(true);
      expect(await Order.findByPk(order.id)).toBeNull();
    });

    it('returns false when order not found', async () => {
      const result = await orderRepository.remove('00000000-0000-0000-0000-000000000000');
      expect(result).toBe(false);
    });
  });
});
