import { userModel, applyUserTransform, TokenType } from './model';
import type { UserDocument, Token } from './model';
import type { UpdateQuery, QueryFilter, UpdateWriteOpResult } from 'mongoose';
import {
    createBaseRepository,
    toObjectId,
    type BaseRepository
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
 * an inferred one at an export boundary (TS7056) — the same reason `BaseRepository` exists.
 */
export const userRepository: BaseRepository<UserDocument> & {
    updateMany: (
        filter: QueryFilter<UserDocument>,
        update: UpdateQuery<UserDocument>
    ) => Promise<UpdateWriteOpResult>;
    findByIdWithCredentials: (id: string) => Promise<UserDocument | null>;
    findOneWithCredentials: (where: QueryFilter<UserDocument>) => Promise<UserDocument | null>;
    findByToken: (token: string, type: Token['type']) => Promise<UserDocument | null>;
    tokenRemove: (id: string, token: string) => Promise<UpdateWriteOpResult>;
    tokenRemoveByValue: (token: string) => Promise<UpdateWriteOpResult>;
    tokenRemoveExpired: () => Promise<number>;
    findByTokenValue: (token: string) => Promise<UserDocument | null>;
    tokenTouch: (token: string) => Promise<UpdateWriteOpResult>;
    sessionRemove: (id: string, sessionId: string) => Promise<UpdateWriteOpResult>;
} = {
    ...createBaseRepository<UserDocument>(userModel, {
        transform: applyUserTransform,
        searchable: {
            objectIds: { id: '_id' },
            text: ['email', 'username'],
            regex: { email: 'email', username: 'username' },
            /*
             * `active` filters the real column, not `deletedAt: { $exists: … }`: "show me
             * deactivated accounts" and "show me deleted accounts" are different questions.
             */
            /*
             * `admin` and `verified` narrow a listing that already answers 403 to anyone who is
             * not staff, which is what makes publishing them safe.
             */
            booleans: { active: 'active', admin: 'admin', verified: 'verified' }
        }
    }),

    /**
     * Update multiple user documents matching the filter.
     */
    updateMany: (filter: QueryFilter<UserDocument>, update: UpdateQuery<UserDocument>) =>
        userModel.updateMany(filter, update).exec(),

    /**
     * Fetch a user by id WITH its credential fields. Use only where they are actually needed.
     */
    findByIdWithCredentials: (id: string) =>
        userModel.findById(id).select(CREDENTIAL_FIELDS).exec(),

    /**
     * Fetch the first user matching the filter WITH its credential fields.
     */
    findOneWithCredentials: (where: QueryFilter<UserDocument>) =>
        userModel.findOne(where).select(CREDENTIAL_FIELDS).exec(),

    /**
     * Fetch the user holding a token of this exact type, WITH its credential fields.
     *
     * `$elemMatch` rather than two dotted paths, and that is the whole point of the method. Written
     * as `{ 'tokens.token': token, 'tokens.type': type }`, Mongo applies each condition to the
     * array independently: it matches a user holding the value in ONE entry and the type in
     * ANOTHER. A user with both a reset token and a delete token — the ordinary state during an
     * account deletion — is therefore returned by a lookup for either type, whichever token was
     * supplied. `$elemMatch` requires both conditions to hold on the SAME entry, which is what
     * "holds a password-reset token" means.
     *
     * Credentials included: `tokens` carries `select: false`, and every caller reads the matching
     * entry's expiration straight off the returned document.
     *
     * @param token - the token value from the link the user followed
     * @param type - which kind of token it must be
     * @returns the holder, or `null`
     */
    findByToken: (token: string, type: Token['type']) =>
        userModel
            .findOne({ tokens: { $elemMatch: { token, type } } })
            .select(CREDENTIAL_FIELDS)
            .exec(),

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
     * Drop every expired token from every document in the collection — the housekeeping sweep.
     *
     * This was a `static` on the schema, and it returned `{ status: 200 | 500, success }` — an
     * HTTP status code minted one layer BELOW the repository, which a controller then replayed
     * into the response. A model cannot know what a failed sweep means to a client, and nothing
     * else in this file pretends to: the count is the honest answer, and deciding what it means
     * is the service's.
     *
     * `timestamps: false` — expiring a token is not a change to the account.
     */
    tokenRemoveExpired: () => {
        const now = new Date();
        return userModel
            .updateMany(
                { 'tokens.expiration': { $lt: now } },
                { $pull: { tokens: { expiration: { $lt: now } } } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount);
    },

    /**
     * The holder of this token value, whatever kind it is.
     *
     * Deliberately untyped by token kind, unlike `findByToken`: this is the REVOCATION lookup the
     * refresh flow runs, and its question is "does this credential still exist on a document" —
     * a signed token whose row has been pulled by a logout is exactly what it must not find.
     * Narrowing it to one type would make the answer depend on a second field the JWT itself does
     * not carry.
     */
    findByTokenValue: (token: string) => userModel.findOne({ 'tokens.token': token }).exec(),

    /**
     * Stamp a token as used, so `GET /account/sessions` can show which device is idle.
     *
     * A POSITIONAL update rather than a read-modify-write: `tokens.$` addresses the matched entry
     * and mongod evaluates it at write time, so two devices refreshing at once cannot overwrite
     * each other's array — the same rule every other token write here follows.
     *
     * `timestamps: false` — using a session is not a change to the account.
     */
    tokenTouch: (token: string) =>
        userModel
            .updateOne(
                { 'tokens.token': token },
                { $set: { 'tokens.$.lastUsedAt': new Date() } },
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
                { $pull: { tokens: { _id: toObjectId(sessionId), type: TokenType.REFRESH } } },
                { timestamps: false }
            )
            .exec()
};
