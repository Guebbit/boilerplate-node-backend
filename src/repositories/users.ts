import { Op } from 'sequelize';
import UserModel from '@models/users';
import { CartItemModel, UserTokenModel } from '@models/users';
import type { IUser, IToken } from '@models/users';
import type { IUserDocument } from '@models/users';
import { ProductModel } from '@models/products';

/**
 * User Repository
 * Handles all raw database operations for the User entity.
 * No business logic here — only CRUD operations against Sequelize.
 */

/**
 * Find a user by its primary key (integer id)
 *
 * @param id
 */
export const findById = (id: number | string): Promise<IUserDocument | null> =>
    UserModel.findByPk(Number(id));

/**
 * Find a single user matching the given filter.
 * Supports simple equality filters and special keys like deletedAt.
 *
 * @param where
 */
export const findOne = (where: Partial<IUser & { 'tokens.token'?: string }>): Promise<IUserDocument | null> => {
    // Special case: find user by token value (via UserToken association)
    if (where['tokens.token'] !== undefined) {
        const token = where['tokens.token'];
        return UserModel.findOne({
            include: [{
                model: UserTokenModel,
                as: 'tokens',
                where: { token },
                required: true,
            }],
        });
    }
    // Build where clause, handling special deletedAt cases
    const builtWhere: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(where)) {
        if (key === 'deletedAt') {
            if (value === undefined || value === null)
                builtWhere[key] = null;
            else
                builtWhere[key] = value;
        } else {
            builtWhere[key] = value;
        }
    }
    return UserModel.findOne({ where: builtWhere });
};

/**
 * Find all users matching the given filter with optional pagination support.
 * Returns plain objects for read-only usage.
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
): Promise<IUserDocument[]> =>
    UserModel.findAll({
        where: buildSequelizeWhere(where),
        order: sort,
        offset: skip,
        limit,
    });

/**
 * Count users matching the given filter
 *
 * @param where
 */
export const count = (where: Record<string, unknown> = {}): Promise<number> =>
    UserModel.count({ where: buildSequelizeWhere(where) });

/**
 * Create a new user record
 *
 * @param data
 */
export const create = (data: Partial<IUser>): Promise<IUserDocument> =>
    UserModel.create(data as IUser);

/**
 * Persist changes to an existing user record
 *
 * @param user
 */
export const save = (user: IUserDocument): Promise<IUserDocument> =>
    user.save();

/**
 * Hard-delete a user record from the database
 *
 * @param user
 */
export const deleteOne = (user: IUserDocument): Promise<void> =>
    user.destroy();

/**
 * Update multiple user records matching the filter
 *
 * @param filter
 * @param update
 */
export const updateMany = (
    filter: Record<string, unknown>,
    update: Partial<IUser>,
): Promise<[number]> =>
    UserModel.update(update, { where: buildSequelizeWhere(filter) });

// ---------------------------------------------------------------------------
// Cart helpers
// ---------------------------------------------------------------------------

/**
 * Get all cart items for a user, with product details included
 *
 * @param userId
 */
export const findCartItems = (userId: number): Promise<CartItemModel[]> =>
    CartItemModel.findAll({
        where: { userId },
        include: [{ model: ProductModel, as: 'product' }],
    });

/**
 * Find a single cart item by userId and productId
 *
 * @param userId
 * @param productId
 */
export const findCartItem = (userId: number, productId: number): Promise<CartItemModel | null> =>
    CartItemModel.findOne({ where: { userId, productId } });

/**
 * Upsert a cart item (create or update quantity)
 *
 * @param userId
 * @param productId
 * @param quantity
 */
export const upsertCartItem = async (userId: number, productId: number, quantity: number): Promise<CartItemModel> => {
    const [item] = await CartItemModel.upsert({
        userId,
        productId,
        quantity,
        updatedAt: new Date(),
    });
    return item;
};

/**
 * Remove a specific product from a user's cart
 *
 * @param userId
 * @param productId
 */
export const deleteCartItem = (userId: number, productId: number): Promise<number> =>
    CartItemModel.destroy({ where: { userId, productId } });

/**
 * Remove all products from a user's cart
 *
 * @param userId
 */
export const clearCart = (userId: number): Promise<number> =>
    CartItemModel.destroy({ where: { userId } });

/**
 * Remove a product from all users' carts
 *
 * @param productId
 */
export const removeProductFromAllCarts = (productId: number): Promise<number> =>
    CartItemModel.destroy({ where: { productId } });

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Add a token to a user
 *
 * @param userId
 * @param data
 */
export const createToken = (userId: number, data: Omit<IToken, 'id'>): Promise<UserTokenModel> =>
    UserTokenModel.create({ userId, ...data });

/**
 * Remove a specific token by its token string
 *
 * @param token
 */
export const deleteToken = (token: string): Promise<number> =>
    UserTokenModel.destroy({ where: { token } });

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
            // Handle operator objects like { $regex: '...', $options: 'i' }, { $exists: bool }
            const ops = value as Record<string, unknown>;
            if ('$exists' in ops) {
                // $exists: true → IS NOT NULL, $exists: false → IS NULL
                out[key] = ops['$exists'] ? { [Op.not]: null } : null;
            } else if ('$regex' in ops) {
                // Convert regex to SQL LIKE pattern (basic substring match)
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


export default {
    findById,
    findOne,
    findAll,
    count,
    create,
    save,
    deleteOne,
    updateMany,
    findCartItems,
    findCartItem,
    upsertCartItem,
    deleteCartItem,
    clearCart,
    removeProductFromAllCarts,
    createToken,
    deleteToken,
};
