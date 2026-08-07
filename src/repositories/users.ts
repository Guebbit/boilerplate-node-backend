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
    deletedScope: (active?: boolean | null) => Record<string, unknown>;
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
            regex: { email: 'email', username: 'username' }
        }
    }),

    /**
     * Restrict a query to live or to soft-deleted users.
     *
     * Users have no `active` column — the admin panel's "active" filter means "has no
     * `deletedAt`", which is a storage detail and so belongs here. Returns an empty scope when
     * the caller did not filter, so both states come back.
     */
    deletedScope: (active?: boolean | null): Record<string, unknown> => {
        if (active === undefined || active === null) return {};
        return {
            deletedAt: active ? { $exists: false } : { $exists: true, $type: 'date' }
        };
    },

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
