import userModel from '@models/users';
import type { IUserDocument } from '@models/users';
import type { FilterQuery as QueryFilter, UpdateQuery } from 'mongoose';

/**
 * User Repository
 * Handles all raw database operations for the User entity.
 * No business logic here — only CRUD operations against Mongoose.
 */

/**
 * Find a user by its MongoDB ObjectId
 *
 * @param id
 */
export const findById = (id: string): Promise<IUserDocument | null> =>
    userModel.findById(id);

/**
 * Find a single user matching the given query
 *
 * @param where
 */
export const findOne = (where: QueryFilter<IUserDocument>): Promise<IUserDocument | null> =>
    userModel.findOne(where);

/**
 * Find all users matching the given query with optional pagination support.
 * Returns lean (plain JS) objects for read-only usage.
 *
 * @param where
 * @param options
 */
export const findAll = (
    where: QueryFilter<IUserDocument> = {},
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
    userModel
        .find({ ...where })
        .lean()
        // eslint-disable-next-line unicorn/no-array-sort
        .sort(sort)
        .skip(skip)
        .limit(limit);

/**
 * Count users matching the given query
 *
 * @param where
 */
export const count = (where: QueryFilter<IUserDocument> = {}): Promise<number> =>
    userModel.countDocuments(where);

/**
 * Create a new user document
 *
 * @param data
 */
export const create = (data: Partial<IUserDocument>): Promise<IUserDocument> =>
    userModel.create(data);

/**
 * Persist changes to an existing user document
 *
 * @param user
 */
export const save = (user: IUserDocument): Promise<IUserDocument> =>
    user.save();

/**
 * Hard-delete a user document from the database
 *
 * @param user
 */
export const deleteOne = (user: IUserDocument): Promise<void> =>
    user.deleteOne().then(() => {
        // explicit void return to satisfy TypeScript's Promise<void> type
    });

/**
 * Update multiple user documents matching the filter
 *
 * @param filter
 * @param update
 */
export const updateMany = (
    filter: QueryFilter<IUserDocument>,
    update: UpdateQuery<IUserDocument>,
) =>
    userModel.updateMany(filter, update);


export default { findById, findOne, findAll, count, create, save, deleteOne, updateMany };
