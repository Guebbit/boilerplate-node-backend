import UserModel, { CartItemModel, TokenModel } from '@models/users';
import type { IUser, ICartItem, IToken } from '@models/users';
import type { WhereOptions, Order, UpdateOptions } from 'sequelize';

/**
 * User Repository
 * Handles all raw database operations for the User entity.
 * No business logic here — only CRUD operations against Sequelize.
 */

/**
 * Find a user by its ID
 *
 * @param id
 */
export const findById = (id: string | number): Promise<UserModel | null> =>
    UserModel.findByPk(id, {
        include: [
            { model: CartItemModel, as: 'cartItems' },
            { model: TokenModel, as: 'tokens' },
        ],
    });

/**
 * Find a single user matching the given query
 *
 * @param where
 */
export const findOne = (where: WhereOptions<IUser>): Promise<UserModel | null> =>
    UserModel.findOne({
        where,
        include: [
            { model: CartItemModel, as: 'cartItems' },
            { model: TokenModel, as: 'tokens' },
        ],
    });

/**
 * Find all users matching the given query with optional pagination support.
 *
 * @param where
 * @param options
 */
export const findAll = async (
    where: WhereOptions<IUser> = {},
    {
        sort = [['createdAt', 'DESC']] as Order,
        skip = 0,
        limit = 10,
    }: {
        sort?: Order;
        skip?: number;
        limit?: number;
    } = {},
): Promise<IUser[]> => {
    const users = await UserModel.findAll({
        where,
        order: sort,
        offset: skip,
        limit,
        raw: true, // Returns plain objects
    });
    return users as unknown as IUser[];
};

/**
 * Count users matching the given query
 *
 * @param where
 */
export const count = (where: WhereOptions<IUser> = {}): Promise<number> =>
    UserModel.count({ where });

/**
 * Create a new user
 *
 * @param data
 */
export const create = (data: Partial<IUser>): Promise<UserModel> =>
    UserModel.create(data as IUser);

/**
 * Persist changes to an existing user
 *
 * @param user
 */
export const save = (user: UserModel): Promise<UserModel> =>
    user.save();

/**
 * Hard-delete a user from the database
 *
 * @param user
 */
export const deleteOne = async (user: UserModel): Promise<void> => {
    await user.destroy({ force: true });
};

/**
 * Update multiple users matching the filter
 *
 * @param filter
 * @param update
 */
export const updateMany = (
    filter: WhereOptions<IUser>,
    update: Partial<IUser>,
): Promise<[affectedCount: number]> =>
    UserModel.update(update, { where: filter } as UpdateOptions);

/**
 * Cart Item operations
 */
export const CartItem = {
    findByUserId: (userId: number): Promise<CartItemModel[]> =>
        CartItemModel.findAll({ where: { userId } }),

    findOne: (where: WhereOptions<ICartItem>): Promise<CartItemModel | null> =>
        CartItemModel.findOne({ where }),

    create: (data: Partial<ICartItem>): Promise<CartItemModel> =>
        CartItemModel.create(data as ICartItem),

    deleteByUserId: (userId: number): Promise<number> =>
        CartItemModel.destroy({ where: { userId } }),

    deleteOne: (item: CartItemModel): Promise<void> =>
        item.destroy().then(() => {}),
};

/**
 * Token operations
 */
export const Token = {
    findByUserId: (userId: number): Promise<TokenModel[]> =>
        TokenModel.findAll({ where: { userId } }),

    findOne: (where: WhereOptions<IToken>): Promise<TokenModel | null> =>
        TokenModel.findOne({ where }),

    create: (data: Partial<IToken>): Promise<TokenModel> =>
        TokenModel.create(data as IToken),

    deleteByUserId: (userId: number): Promise<number> =>
        TokenModel.destroy({ where: { userId } }),

    deleteOne: (token: TokenModel): Promise<void> =>
        token.destroy().then(() => {}),
};


export default { findById, findOne, findAll, count, create, save, deleteOne, updateMany, CartItem, Token };
