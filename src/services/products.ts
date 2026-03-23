import { productRepository } from '../repositories/products';
import type { FindAllProductsResult } from '../repositories/products';
import type { CreateProductInput, UpdateProductInput, SearchProductInput } from '../models/products';
import { Product } from '../models/products';
import { AppError } from './users';

// ─── Product Service ──────────────────────────────────────────────────────────

export const productService = {
  async getById(id: string): Promise<Product> {
    const product = await productRepository.findById(id);
    if (!product) throw new AppError('Product not found', 404);
    return product;
  },

  async search(filters: SearchProductInput): Promise<FindAllProductsResult> {
    return productRepository.findAll(filters);
  },

  async create(data: CreateProductInput): Promise<Product> {
    return productRepository.create(data);
  },

  async update(id: string, data: UpdateProductInput): Promise<Product> {
    const product = await productRepository.update(id, data);
    if (!product) throw new AppError('Product not found', 404);
    return product;
  },

  async remove(id: string): Promise<void> {
    const deleted = await productRepository.remove(id);
    if (!deleted) throw new AppError('Product not found', 404);
  },

  async decrementStock(productId: string, quantity: number): Promise<void> {
    const product = await productRepository.findById(productId);
    if (!product) throw new AppError(`Product ${productId} not found`, 404);
    if ((product.stock ?? 0) < quantity) {
      throw new AppError(`Insufficient stock for product ${productId}`, 400);
    }
    await productRepository.update(productId, { stock: (product.stock ?? 0) - quantity });
  },
};
