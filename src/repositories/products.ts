import { Op } from 'sequelize';
import ProductModel from '@models/products';
import type { IProductDocument } from '@models/products';

/**
 * Product Repository
 * Handles all raw database operations for the Product entity.
 * No business logic here — only CRUD operations against Sequelize.
 */

/**
 * Find a product by its primary key (integer id)
 *
 * @param id
 */
export const findById = (id: number | string): Promise<IProductDocument | null> =>
    ProductModel.findByPk(Number(id));

/**
 * Find a single product matching the given filter
 *
 * @param where
 */
export const findOne = (where: Record<string, unknown>): Promise<IProductDocument | null> =>
    ProductModel.findOne({ where: buildSequelizeWhere(where) });

/**
 * Find all products matching the given filter with optional pagination support.
 * Returns model instances for easy mutation.
 *
 * @param where
 * @param options
 */
export const findAll = (
    where: Record<string, unknown> = {},
    {
        sort = [['createdAt', 'DESC']] as [string, 'ASC' | 'DESC'][],
        skip = 0,
        limit = 10,
    }: {
        sort?: [string, 'ASC' | 'DESC'][];
        skip?: number;
        limit?: number;
    } = {},
): Promise<IProductDocument[]> =>
    ProductModel.findAll({
        where: buildSequelizeWhere(where),
        order: sort,
        offset: skip,
        limit,
    });

/**
 * Count products matching the given filter
 *
 * @param where
 */
export const count = (where: Record<string, unknown> = {}): Promise<number> =>
    ProductModel.count({ where: buildSequelizeWhere(where) });

/**
 * Create a new product record
 *
 * @param data
 */
export const create = (data: Partial<IProductDocument>): Promise<IProductDocument> =>
    ProductModel.create(data as Parameters<typeof ProductModel.create>[0]);

/**
 * Persist changes to an existing product record
 *
 * @param product
 */
export const save = (product: IProductDocument): Promise<IProductDocument> =>
    product.save();

/**
 * Hard-delete a product record from the database
 *
 * @param product
 */
export const deleteOne = (product: IProductDocument): Promise<void> =>
    product.destroy();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a plain filter object to a Sequelize-compatible where clause.
 * Handles `null`/`undefined` for deletedAt and `$regex` (converted to Op.like).
 *
 * @param where
 */
function buildSequelizeWhere(where: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(where)) {
        if (value === undefined || value === null) {
            out[key] = null;
        } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            const ops = value as Record<string, unknown>;
            if ('$exists' in ops) {
                out[key] = ops['$exists'] ? { [Op.not]: null } : null;
            } else if ('$regex' in ops) {
                out[key] = { [Op.like]: `%${ops['$regex']}%` };
            } else if ('$gte' in ops || '$lte' in ops) {
                const range: Record<symbol, unknown> = {};
                if ('$gte' in ops) range[Op.gte] = ops['$gte'];
                if ('$lte' in ops) range[Op.lte] = ops['$lte'];
                out[key] = range;
            } else {
                out[key] = value;
            }
        } else {
            out[key] = value;
        }
    }
    return out;
}


export default { findById, findOne, findAll, count, create, save, deleteOne };