import productModel from '../models/products';
import type { IProductDocument } from '../models/products';
import type { QueryFilter } from 'mongoose';

/**
 * Product Repository
 * Handles all raw database operations for the Product entity.
 * No business logic here — only CRUD operations against Mongoose.
 */

/**
 * Find a product by its MongoDB ObjectId
 *
 * @param id
 */
export const findById = (id: string) =>
    productModel.findById(id);

/**
 * Find a single product matching the given query
 *
 * @param where
 */
export const findOne = (where: QueryFilter<IProductDocument>) =>
    productModel.findOne(where);

/**
 * Find all products matching the given query with optional pagination support.
 * Returns lean (plain JS) objects for read-only usage.
 *
 * @param where
 * @param options
 */
export const findAll = (
    where: QueryFilter<IProductDocument> = {},
    {
        sort = { createdAt: -1 as const },
        skip = 0,
        limit = 10,
    }: {
        sort?: Record<string, 1 | -1>;
        skip?: number;
        limit?: number;
    } = {},
) =>
    productModel
        .find({ ...where })
        .lean()
        // eslint-disable-next-line unicorn/no-array-sort
        .sort(sort)
        .skip(skip)
        .limit(limit);

/**
 * Count products matching the given query
 *
 * @param where
 */
export const count = (where: QueryFilter<IProductDocument> = {}): Promise<number> =>
    productModel.countDocuments(where);

/**
 * Create a new product document
 *
 * @param data
 */
export const create = (data: Partial<IProductDocument>): Promise<IProductDocument> =>
    productModel.create(data);

/**
 * Persist changes to an existing product document
 *
 * @param product
 */
export const save = (product: IProductDocument): Promise<IProductDocument> =>
    product.save();

/**
 * Hard-delete a product document from the database
 *
 * @param product
 */
export const deleteOne = (product: IProductDocument): Promise<void> =>
    product.deleteOne().then(() => {
        // explicit void return to satisfy TypeScript's Promise<void> type
    });
