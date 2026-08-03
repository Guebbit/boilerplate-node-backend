import { userModel } from '@models/users';
import type { IUserDocument } from '@models/users';
import type { UpdateQuery, QueryFilter } from 'mongoose';
import { createBaseRepository, type IFindAllOptions } from './base';

/**
 * User Repository
 * Standard CRUD via base factory + user-specific operations.
 */
const base = createBaseRepository<IUserDocument>(userModel);

export const findById = (id: string) => base.findById(id);
export const findOne = (where: QueryFilter<IUserDocument>) => base.findOne(where);
export const findAll = (where: QueryFilter<IUserDocument> = {}, options: IFindAllOptions = {}) =>
    base.findAll(where, options);
export const count = (where: QueryFilter<IUserDocument> = {}): Promise<number> => base.count(where);
export const create = (data: Partial<IUserDocument>): Promise<IUserDocument> => base.create(data);
export const deleteOne = (user: IUserDocument): Promise<void> => base.deleteOne(user);
export const save = (user: IUserDocument): Promise<IUserDocument> => base.save(user);

/**
 * Update multiple user documents matching the filter.
 */
export const updateMany = (
    filter: QueryFilter<IUserDocument>,
    update: UpdateQuery<IUserDocument>
) => userModel.updateMany(filter, update);

/**
 * `password` and `tokens` are `select: false` on the schema, so the plain finders above never
 * load them. The two helpers below are the ONLY sanctioned way to get them back — keeping the
 * re-selection written down in one place instead of scattered `.select('+password')` calls.
 *
 * Callers: login (password), password change / reset-confirm (password), token add / remove-all,
 * reset-confirm and delete-confirm (tokens).
 */
const CREDENTIAL_FIELDS = '+password +tokens';

/**
 * Fetch a user by id WITH its credential fields. Use only where they are actually needed.
 */
export const findByIdWithCredentials = (id: string) =>
    userModel.findById(id).select(CREDENTIAL_FIELDS);

/**
 * Fetch the first user matching the filter WITH its credential fields.
 */
export const findOneWithCredentials = (where: QueryFilter<IUserDocument>) =>
    userModel.findOne(where).select(CREDENTIAL_FIELDS);

export const userRepository = {
    findById,
    findOne,
    findAll,
    count,
    create,
    save,
    deleteOne,
    updateMany,
    findByIdWithCredentials,
    findOneWithCredentials
};
