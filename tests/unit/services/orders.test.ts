import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-key-for-testing-purposes';

vi.mock('../../../src/repositories/orders', () => ({
  orderRepository: {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('../../../src/services/products', () => ({
  productService: {
    decrementStock: vi.fn(),
  },
}));

import { orderRepository } from '../../../src/repositories/orders';
import { productService } from '../../../src/services/products';
import { orderService } from '../../../src/services/orders';
import { AppError } from '../../../src/services/users';
import { OrderStatus } from '../../../src/types/index';

const mockRepo = orderRepository as {
  findById: ReturnType<typeof vi.fn>;
  findAll: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const mockProductService = productService as {
  decrementStock: ReturnType<typeof vi.fn>;
};

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const ORDER_ID = '550e8400-e29b-41d4-a716-446655440002';
const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';

const makeMockOrder = (overrides = {}) => ({
  id: ORDER_ID,
  userId: USER_ID,
  status: OrderStatus.PENDING,
  totalAmount: 100,
  items: [{ productId: PRODUCT_ID, quantity: 2, unitPrice: 50 }],
  notes: null,
  ...overrides,
});

describe('orderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getById ──────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns the order when found', async () => {
      const mockOrder = makeMockOrder();
      mockRepo.findById.mockResolvedValue(mockOrder);

      const result = await orderService.getById(ORDER_ID);
      expect(result).toBe(mockOrder);
    });

    it('throws 404 when order not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(orderService.getById('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ─── search ───────────────────────────────────────────────────────────────────

  describe('search', () => {
    it('delegates to repository and returns results', async () => {
      const mockResult = {
        rows: [makeMockOrder()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockRepo.findAll.mockResolvedValue(mockResult);

      const result = await orderService.search({ page: 1, limit: 20 });
      expect(result).toBe(mockResult);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates an order after decrementing stock', async () => {
      const mockOrder = makeMockOrder();
      mockProductService.decrementStock.mockResolvedValue(undefined);
      mockRepo.create.mockResolvedValue(mockOrder);

      const data = {
        items: [{ productId: PRODUCT_ID, quantity: 2, unitPrice: 50 }],
      };

      const result = await orderService.create(USER_ID, data);
      expect(result).toBe(mockOrder);
      expect(mockProductService.decrementStock).toHaveBeenCalledWith(PRODUCT_ID, 2);
      expect(mockRepo.create).toHaveBeenCalledOnce();
    });

    it('throws when decrementStock fails (insufficient stock)', async () => {
      mockProductService.decrementStock.mockRejectedValue(new AppError('Insufficient stock', 400));

      const data = {
        items: [{ productId: PRODUCT_ID, quantity: 99, unitPrice: 50 }],
      };

      await expect(orderService.create(USER_ID, data)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus ─────────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('updates the order status successfully', async () => {
      const mockOrder = makeMockOrder({ status: OrderStatus.PENDING });
      const updatedOrder = makeMockOrder({ status: OrderStatus.PROCESSING });

      mockRepo.findById.mockResolvedValue(mockOrder);
      mockRepo.update.mockResolvedValue(updatedOrder);

      const result = await orderService.updateStatus(ORDER_ID, { status: OrderStatus.PROCESSING });
      expect(result.status).toBe(OrderStatus.PROCESSING);
    });

    it('throws 404 when order not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(orderService.updateStatus('00000000-0000-0000-0000-000000000000', {
        status: OrderStatus.PROCESSING,
      })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 400 when order is already delivered', async () => {
      const mockOrder = makeMockOrder({ status: OrderStatus.DELIVERED });
      mockRepo.findById.mockResolvedValue(mockOrder);

      await expect(orderService.updateStatus(ORDER_ID, { status: OrderStatus.SHIPPED })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('throws 400 when order is already cancelled', async () => {
      const mockOrder = makeMockOrder({ status: OrderStatus.CANCELLED });
      mockRepo.findById.mockResolvedValue(mockOrder);

      await expect(orderService.updateStatus(ORDER_ID, { status: OrderStatus.PROCESSING })).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ─── cancel ───────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels a pending order', async () => {
      const mockOrder = makeMockOrder({ status: OrderStatus.PENDING });
      const cancelledOrder = makeMockOrder({ status: OrderStatus.CANCELLED });

      mockRepo.findById.mockResolvedValue(mockOrder);
      mockRepo.update.mockResolvedValue(cancelledOrder);

      const result = await orderService.cancel(ORDER_ID);
      expect(result.status).toBe(OrderStatus.CANCELLED);
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes an order successfully', async () => {
      mockRepo.remove.mockResolvedValue(true);
      await expect(orderService.remove(ORDER_ID)).resolves.not.toThrow();
    });

    it('throws 404 when order not found', async () => {
      mockRepo.remove.mockResolvedValue(false);
      await expect(orderService.remove('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
