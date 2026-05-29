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
export const findAll = (where: QueryFilter<IUserDocument> = {}, options: IFindAllOptions = {}) => base.findAll(where, options);
export const count = (where: QueryFilter<IUserDocument> = {}): Promise<number> => base.count(where);
export const create = (data: Partial<IUserDocument>): Promise<IUserDocument> => base.create(data);
export const deleteOne = (user: IUserDocument): Promise<void> => base.deleteOne(user);

/**
 * Persist changes to a user document.
 * LSP: accepts only Mongoose documents with a .save() method.
 * If you have a lean/plain object, use findByIdAndUpdate directly.
 */
export const save = (user: IUserDocument): Promise<IUserDocument> => {
    if (typeof user.save === 'function') return user.save();

    // Fallback for edge cases where a populated/transformed doc lost its prototype.
    // This is explicitly documented as a degraded path.
    const id = user._id?.toString() ?? user.id;
    if (!id) throw new Error('Cannot save user: missing _id or id');

    return userModel
        .findByIdAndUpdate(id, user, { new: true, runValidators: true })
        .then((savedUser) => {
            if (!savedUser) throw new Error('User not found during save');
            return savedUser;
        });
};

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
