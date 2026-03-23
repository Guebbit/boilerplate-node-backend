import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-key-for-testing-purposes';

vi.mock('../../../src/repositories/products', () => ({
  productRepository: {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

import { productRepository } from '../../../src/repositories/products';
import { productService } from '../../../src/services/products';
import { AppError } from '../../../src/services/users';

const mockRepo = productRepository as {
  findById: ReturnType<typeof vi.fn>;
  findAll: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const makeMockProduct = (overrides = {}) => ({
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Product',
  price: 99.99,
  stock: 10,
  description: 'A test product',
  ...overrides,
});

describe('productService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getById ──────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns the product when found', async () => {
      const mockProduct = makeMockProduct();
      mockRepo.findById.mockResolvedValue(mockProduct);

      const result = await productService.getById('550e8400-e29b-41d4-a716-446655440001');
      expect(result).toBe(mockProduct);
    });

    it('throws 404 when product not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(productService.getById('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ─── search ───────────────────────────────────────────────────────────────────

  describe('search', () => {
    it('delegates to repository and returns results', async () => {
      const mockResult = {
        rows: [makeMockProduct()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockRepo.findAll.mockResolvedValue(mockResult);

      const result = await productService.search({ page: 1, limit: 20 });
      expect(result).toBe(mockResult);
      expect(mockRepo.findAll).toHaveBeenCalledOnce();
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates and returns a product', async () => {
      const mockProduct = makeMockProduct({ name: 'New Widget' });
      mockRepo.create.mockResolvedValue(mockProduct);

      const result = await productService.create({ name: 'New Widget', price: 29.99, stock: 50 });
      expect(result).toBe(mockProduct);
      expect(mockRepo.create).toHaveBeenCalledOnce();
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates and returns the product', async () => {
      const mockProduct = makeMockProduct({ price: 149.99 });
      mockRepo.update.mockResolvedValue(mockProduct);

      const result = await productService.update('550e8400-e29b-41d4-a716-446655440001', { price: 149.99 });
      expect(result).toBe(mockProduct);
    });

    it('throws 404 when product not found', async () => {
      mockRepo.update.mockResolvedValue(null);

      await expect(productService.update('00000000-0000-0000-0000-000000000000', { price: 1 })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes a product successfully', async () => {
      mockRepo.remove.mockResolvedValue(true);
      await expect(productService.remove('550e8400-e29b-41d4-a716-446655440001')).resolves.not.toThrow();
    });

    it('throws 404 when product not found', async () => {
      mockRepo.remove.mockResolvedValue(false);
      await expect(productService.remove('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ─── decrementStock ───────────────────────────────────────────────────────────

  describe('decrementStock', () => {
    it('decrements stock successfully', async () => {
      const mockProduct = makeMockProduct({ stock: 10 });
      mockRepo.findById.mockResolvedValue(mockProduct);
      mockRepo.update.mockResolvedValue({ ...mockProduct, stock: 7 });

      await expect(productService.decrementStock('550e8400-e29b-41d4-a716-446655440001', 3)).resolves.not.toThrow();
      expect(mockRepo.update).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001', { stock: 7 });
    });

    it('throws 400 when insufficient stock', async () => {
      const mockProduct = makeMockProduct({ stock: 2 });
      mockRepo.findById.mockResolvedValue(mockProduct);

      await expect(productService.decrementStock('550e8400-e29b-41d4-a716-446655440001', 5)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('throws 404 when product not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(productService.decrementStock('00000000-0000-0000-0000-000000000000', 1)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
