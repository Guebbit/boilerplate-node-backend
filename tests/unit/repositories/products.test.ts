import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Set test environment before imports
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-key-for-testing-purposes';

import { sequelize } from '../../../src/config/database';
import { Product } from '../../../src/models/products';
import { productRepository } from '../../../src/repositories/products';

describe('productRepository', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await Product.destroy({ where: {}, truncate: true });
  });

  const makeProduct = (overrides = {}) => ({
    name: `Product-${Date.now()}-${Math.random()}`,
    price: 100,
    stock: 10,
    description: 'A test product',
    ...overrides,
  });

  // ─── findById ─────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns a product when found', async () => {
      const created = await Product.create(makeProduct({ name: 'Find Me Product' }));
      const found = await productRepository.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it('returns null when not found', async () => {
      const found = await productRepository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated products', async () => {
      await Product.create(makeProduct({ name: 'Product A', price: 50 }));
      await Product.create(makeProduct({ name: 'Product B', price: 150 }));

      const result = await productRepository.findAll({ page: 1, limit: 10 });
      expect(result.rows.length).toBe(2);
      expect(result.meta.total).toBe(2);
    });

    it('filters by name', async () => {
      await Product.create(makeProduct({ name: 'Laptop Pro' }));
      await Product.create(makeProduct({ name: 'Mouse Basic' }));

      const result = await productRepository.findAll({ page: 1, limit: 10, name: 'Laptop' });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].name).toBe('Laptop Pro');
    });

    it('filters by minPrice', async () => {
      await Product.create(makeProduct({ name: 'Cheap', price: 10 }));
      await Product.create(makeProduct({ name: 'Expensive', price: 1000 }));

      const result = await productRepository.findAll({ page: 1, limit: 10, minPrice: 500 });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].name).toBe('Expensive');
    });

    it('filters by maxPrice', async () => {
      await Product.create(makeProduct({ name: 'Cheap', price: 10 }));
      await Product.create(makeProduct({ name: 'Expensive', price: 1000 }));

      const result = await productRepository.findAll({ page: 1, limit: 10, maxPrice: 50 });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].name).toBe('Cheap');
    });

    it('filters by inStock', async () => {
      await Product.create(makeProduct({ name: 'In Stock', stock: 5 }));
      await Product.create(makeProduct({ name: 'Out of Stock', stock: 0 }));

      const result = await productRepository.findAll({ page: 1, limit: 10, inStock: true });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].name).toBe('In Stock');
    });

    it('respects pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await Product.create(makeProduct({ name: `Paged Product ${i}`, price: i + 1 }));
      }

      const page1 = await productRepository.findAll({ page: 1, limit: 2 });
      expect(page1.rows.length).toBe(2);
      expect(page1.meta.totalPages).toBe(3);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a product with correct data', async () => {
      const data = makeProduct({ name: 'New Widget', price: 29.99, stock: 100 });
      const product = await productRepository.create(data);

      expect(product.id).toBeDefined();
      expect(product.name).toBe('New Widget');
      expect(Number(product.price)).toBeCloseTo(29.99);
      expect(product.stock).toBe(100);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates a product and returns the updated record', async () => {
      const product = await Product.create(makeProduct({ name: 'Old Name', price: 10 }));
      const updated = await productRepository.update(product.id, { name: 'New Name', price: 20 });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('New Name');
      expect(Number(updated?.price)).toBeCloseTo(20);
    });

    it('returns null when product not found', async () => {
      const result = await productRepository.update('00000000-0000-0000-0000-000000000000', { name: 'x' });
      expect(result).toBeNull();
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes a product and returns true', async () => {
      const product = await Product.create(makeProduct({ name: 'Delete Me' }));
      const result = await productRepository.remove(product.id);

      expect(result).toBe(true);
      expect(await Product.findByPk(product.id)).toBeNull();
    });

    it('returns false when product not found', async () => {
      const result = await productRepository.remove('00000000-0000-0000-0000-000000000000');
      expect(result).toBe(false);
    });
  });
});
