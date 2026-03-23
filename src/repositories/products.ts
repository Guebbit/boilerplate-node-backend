import { Op, WhereOptions } from 'sequelize';
import { Product } from '../models/products';
import type { CreateProductInput, UpdateProductInput, SearchProductInput } from '../models/products';
import type { PaginationMeta } from '../types/index';

// ─── Product Repository ───────────────────────────────────────────────────────

export interface FindAllProductsResult {
  rows: Product[];
  meta: PaginationMeta;
}

export const productRepository = {
  async findById(id: string): Promise<Product | null> {
    return Product.findByPk(id);
  },

  async findAll(filters: SearchProductInput): Promise<FindAllProductsResult> {
    const { page, limit, name, minPrice, maxPrice, inStock } = filters;
    // Defensive clamp: Zod schemas enforce min(1), but guard against misuse
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const offset = (safePage - 1) * safeLimit;

    const where: WhereOptions = {};
    if (name) where['name'] = { [Op.like]: `%${name}%` };

    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceFilter: Record<symbol, number> = {};
      if (minPrice !== undefined) priceFilter[Op.gte] = minPrice;
      if (maxPrice !== undefined) priceFilter[Op.lte] = maxPrice;
      where['price'] = priceFilter;
    }

    if (inStock === true) where['stock'] = { [Op.gt]: 0 };

    const { rows, count } = await Product.findAndCountAll({
      where,
      limit: safeLimit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      rows,
      meta: {
        total: count,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(count / safeLimit),
      },
    };
  },

  async create(data: CreateProductInput): Promise<Product> {
    return Product.create(data);
  },

  async update(id: string, data: UpdateProductInput): Promise<Product | null> {
    const product = await Product.findByPk(id);
    if (!product) return null;
    return product.update(data);
  },

  async remove(id: string): Promise<boolean> {
    const deleted = await Product.destroy({ where: { id } });
    return deleted > 0;
  },
};
