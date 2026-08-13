import { userModel, applyUserTransform, ETokenType } from './model';
import type { IUserDocument } from './model';
import type { UpdateQuery, QueryFilter, UpdateWriteOpResult } from 'mongoose';
import {
    createBaseRepository,
    toObjectId,
    type IBaseRepository
} from '@infrastructure/persistence/base-repository';

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
    tokenRemove: (id: string, token: string) => Promise<UpdateWriteOpResult>;
    tokenRemoveByValue: (token: string) => Promise<UpdateWriteOpResult>;
    sessionRemove: (id: string, sessionId: string) => Promise<UpdateWriteOpResult>;
} = {
    ...createBaseRepository<IUserDocument>(userModel, {
        transform: applyUserTransform,
        searchable: {
            objectIds: { id: '_id' },
            text: ['email', 'username'],
            regex: { email: 'email', username: 'username' },
            /*
             * `active` filters the real column, not `deletedAt: { $exists: … }`: "show me
             * deactivated accounts" and "show me deleted accounts" are different questions.
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
        userModel.findOne(where).select(CREDENTIAL_FIELDS).exec(),

    /**
     * Spend one token by value, atomically.
     *
     * `$pull` against mongod rather than filtering the loaded `tokens` array and calling `save()`.
     * The reset-confirm flow saves the same document twice — once for the new password, once to
     * consume the token — so two simultaneous confirms of one link both loaded version V and the
     * second `save()` raised a `VersionError`, which the controller's blanket catch reported as a
     * 500 on a request that had already succeeded.
     *
     * Idempotent by construction: pulling a token that is no longer there matches nothing and
     * reports `modifiedCount: 0`, which is the honest answer to "was I the one who spent it".
     *
     * `timestamps: false` — spending a token is not a change to the account.
     */
    tokenRemove: (id: string, token: string) =>
        userModel
            .updateOne(
                { _id: toObjectId(id) },
                { $pull: { tokens: { token } } },
                {
                    timestamps: false
                }
            )
            .exec(),

    /**
     * Spend one token by VALUE ALONE, atomically — the single-session logout.
     *
     * No user id in the filter, because the caller does not have one: `POST /account/logout`
     * works from the refresh cookie with no bearer token, and the cookie's value is itself the
     * proof of ownership — whoever presents it IS that session. The filter finds the document
     * holding the value; the `$pull` removes exactly that entry.
     *
     * Idempotent like `tokenRemove`: a value no document holds matches nothing and reports
     * `modifiedCount: 0`, which the logout deliberately does not distinguish — the caller's goal
     * is "not logged in here", and that is true either way.
     *
     * `timestamps: false` — ending a session is not a change to the account.
     */
    tokenRemoveByValue: (token: string) =>
        userModel
            .updateOne(
                { 'tokens.token': token },
                { $pull: { tokens: { token } } },
                { timestamps: false }
            )
            .exec(),

    /**
     * Revoke one refresh token by its SUBDOCUMENT id — "log out that device".
     *
     * The id filter carries the owner as well as the session: a caller can only revoke entries
     * on their own document, so a guessed or leaked session id from someone else's listing
     * matches nothing and reports `modifiedCount: 0`, which the controller answers as 404.
     *
     * `type` is pinned to `refresh` so the handle from `GET /account/sessions` cannot be turned
     * against the other token kinds — a pending reset or delete confirmation is not a session,
     * and this endpoint must not be able to cancel one.
     *
     * `timestamps: false` — ending a session is not a change to the account.
     */
    sessionRemove: (id: string, sessionId: string) =>
        userModel
            .updateOne(
                { _id: toObjectId(id) },
                { $pull: { tokens: { _id: toObjectId(sessionId), type: ETokenType.REFRESH } } },
                { timestamps: false }
            )
            .exec()
};
