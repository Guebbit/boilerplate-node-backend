import ProductModel from '@models/products';
import type { IProduct } from '@models/products';
import type { WhereOptions, Order } from 'sequelize';

/**
 * Product Repository
 * Handles all raw database operations for the Product entity.
 * No business logic here — only CRUD operations against Sequelize.
 */

/**
 * Find a product by its ID
 *
 * @param id
 */
export const findById = (id: string | number): Promise<ProductModel | null> =>
    ProductModel.findByPk(id);

/**
 * Find a single product matching the given query
 *
 * @param where
 */
export const findOne = (where: WhereOptions<IProduct>): Promise<ProductModel | null> =>
    ProductModel.findOne({ where });

/**
 * Find all products matching the given query with optional pagination support.
 *
 * @param where
 * @param options
 */
export const findAll = async (
    where: WhereOptions<IProduct> = {},
    {
        sort = [['createdAt', 'DESC']] as Order,
        skip = 0,
        limit = 10,
    }: {
        sort?: Order;
        skip?: number;
        limit?: number;
    } = {},
): Promise<IProduct[]> => {
    const products = await ProductModel.findAll({
        where,
        order: sort,
        offset: skip,
        limit,
        raw: true, // Returns plain objects like Mongoose lean()
    });
    return products as unknown as IProduct[];
};

/**
 * Count products matching the given query
 *
 * @param where
 */
export const count = (where: WhereOptions<IProduct> = {}): Promise<number> =>
    ProductModel.count({ where });

/**
 * Create a new product
 *
 * @param data
 */
export const create = (data: Partial<IProduct>): Promise<ProductModel> =>
    ProductModel.create(data as IProduct);

/**
 * Persist changes to an existing product
 *
 * @param product
 */
export const save = (product: ProductModel): Promise<ProductModel> =>
    product.save();

/**
 * Hard-delete a product from the database
 *
 * @param product
 */
export const deleteOne = async (product: ProductModel): Promise<void> => {
    await product.destroy({ force: true });
};


export default { findById, findOne, findAll, count, create, save, deleteOne };
