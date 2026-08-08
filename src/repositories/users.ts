import { userModel, applyUserTransform } from '@models/users';
import type { IUserDocument } from '@models/users';
import type { UpdateQuery, QueryFilter, UpdateWriteOpResult } from 'mongoose';
import { createBaseRepository, type IBaseRepository } from './base';

/**
 * `password` and `tokens` are `select: false` on the schema, so the plain finders never load
 * them. The two helpers below are the ONLY sanctioned way to get them back — keeping the
 * re-selection written down in one place instead of scattered `.select('+password')` calls.
 *
 * Callers: login (password), password change / reset-confirm (password), token add / remove-all,
 * reset-confirm and delete-confirm (tokens).
 */
const CREDENTIAL_FIELDS = '+password +tokens';

/**
 * User Repository
 * Standard CRUD via the base factory, plus credential reads and soft-delete scoping.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `IBaseRepository` exists.
 */
export const userRepository: IBaseRepository<IUserDocument> & {
    updateMany: (
        filter: QueryFilter<IUserDocument>,
        update: UpdateQuery<IUserDocument>
    ) => Promise<UpdateWriteOpResult>;
    findByIdWithCredentials: (id: string) => Promise<IUserDocument | null>;
    findOneWithCredentials: (where: QueryFilter<IUserDocument>) => Promise<IUserDocument | null>;
} = {
    ...createBaseRepository<IUserDocument>(userModel, {
        transform: applyUserTransform,
        searchable: {
            objectIds: { id: '_id' },
            text: ['email', 'username'],
            regex: { email: 'email', username: 'username' },
            /*
             * `active` filters the real column. It used to be a `deletedScope()` that turned this
             * filter into `deletedAt: { $exists: … }`, back when users had no `active` column and
             * the two concepts were one field — so "show me deactivated accounts" and "show me
             * deleted accounts" were the same query and neither could be asked on its own.
             */
            booleans: { active: 'active' }
        }
    }),

    /**
     * Update multiple user documents matching the filter.
     */
    updateMany: (filter: QueryFilter<IUserDocument>, update: UpdateQuery<IUserDocument>) =>
        userModel.updateMany(filter, update).exec(),

    /**
     * Fetch a user by id WITH its credential fields. Use only where they are actually needed.
     */
    findByIdWithCredentials: (id: string) =>
        userModel.findById(id).select(CREDENTIAL_FIELDS).exec(),

    /**
     * Fetch the first user matching the filter WITH its credential fields.
     */
    findOneWithCredentials: (where: QueryFilter<IUserDocument>) =>
        userModel.findOne(where).select(CREDENTIAL_FIELDS).exec()
};
