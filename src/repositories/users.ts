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

export const userRepository = {
    findById,
    findOne,
    findAll,
    count,
    create,
    save,
    deleteOne,
    updateMany
};
