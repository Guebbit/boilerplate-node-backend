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
 * Persist changes to an existing user document.
 * Handles both Mongoose documents and lean objects.
 */
export const save = (user: IUserDocument): Promise<IUserDocument> => {
    if (typeof user.save === 'function') return user.save();

    const id = user._id?.toString() ?? user.id;
    if (!id) throw new Error('Cannot save user without id');

    return userModel
        .findByIdAndUpdate(id, user, { new: true, runValidators: true })
        .then((savedUser) => {
            if (!savedUser) throw new Error('404');
            return savedUser;
        });
};

/**
 * Update multiple user documents matching the filter
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
