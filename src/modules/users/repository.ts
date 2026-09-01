/**
 * @module
 * The user collection's persistence layer: standard CRUD from the repository factory, plus the
 * credential and token operations `account` needs from the other side of the shared-kernel edge.
 *
 * See: docs/modules/users.md
 */

import { userModel, applyUserTransform, TokenType, hashToken } from './model';
import type { UserDocument, Token } from './model';
import type { UpdateQuery, QueryFilter, UpdateWriteOpResult } from 'mongoose';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import type { ImageWriteback } from '@infrastructure/adapters/image.worker';

/**
 * `password` and `tokens` are `select: false` on the schema, so plain finders never load them.
 * These two helpers are the ONLY sanctioned way to get them back, keeping re-selection in one
 * place instead of scattered `.select('+password')` calls.
 */
const CREDENTIAL_FIELDS = '+password +tokens';

/**
 * The clause every login-adjacent lookup filters on: `active` may be absent on a row written
 * before `db/migrations/20260808120000-user-active-column.js`, so `{ $ne: false }` rather than
 * `true`. Shared by `findAuthenticatableById` and `findByTokenValue` so the two can't drift.
 */
const AUTHENTICATABLE_FILTER = { active: { $ne: false }, deletedAt: undefined };

/**
 * Standard CRUD via the repository factory, plus credential reads and soft-delete scoping. The
 * type is written out because Mongoose's generics are too large for TypeScript to serialize an
 * inferred one at an export boundary (TS7056) — the same reason `Repository` exists.
 */
export const userRepository: Repository<UserDocument> & {
    updateMany: (
        filter: QueryFilter<UserDocument>,
        update: UpdateQuery<UserDocument>
    ) => Promise<UpdateWriteOpResult>;
    findByIdWithCredentials: (id: string) => Promise<UserDocument | null>;
    findOneWithCredentials: (where: QueryFilter<UserDocument>) => Promise<UserDocument | null>;
    findByToken: (token: string, type: Token['type']) => Promise<UserDocument | null>;
    findAuthenticatableById: (id: string) => Promise<UserDocument | null>;
    tokenRemove: (id: string, token: string) => Promise<UpdateWriteOpResult>;
    tokenRemoveByValue: (token: string) => Promise<UpdateWriteOpResult>;
    tokenRemoveExpired: () => Promise<number>;
    findByTokenValue: (token: string) => Promise<UserDocument | null>;
    tokenTouch: (token: string) => Promise<UpdateWriteOpResult>;
    sessionRemove: (id: string, sessionId: string) => Promise<UpdateWriteOpResult>;
    writebackImage: ImageWriteback;
} = {
    ...createRepository<UserDocument>(userModel, {
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
     * Fetch the user holding a token of this exact type, WITH its credential fields. `$elemMatch`
     * matches both conditions on the SAME array entry — a plain two-path filter would also match
     * a reset-token holder via an unrelated delete token from the same account-deletion flow.
     *
     * `token` is hashed before the query — wave 3.1, the stored value is `hashToken(token)`, never
     * the plaintext.
     *
     * @param token - the token value from the link the user followed
     * @param type - which kind of token it must be
     * @returns the holder, or `null`
     */
    findByToken: (token: string, type: Token['type']) =>
        userModel
            .findOne({ tokens: { $elemMatch: { token: hashToken(token), type } } })
            .select(CREDENTIAL_FIELDS)
            .exec(),

    /**
     * Fetch a user by id, but only if the account may still authenticate — `active` is not
     * `false` and `deletedAt` is unset. The narrower sibling of `findById`: `resolve()` in
     * `account/module.ts` is the only caller, since every OTHER `findById` call in the codebase
     * deliberately needs the unscoped read (a deactivated account in the admin panel, a payer who
     * no longer exists, historical work attached to a gone user). Named for the question it
     * answers, like `findByIdWithCredentials`.
     */
    findAuthenticatableById: (id: string) =>
        userModel.findOne({ _id: toObjectId(id), ...AUTHENTICATABLE_FILTER }).exec(),

    /**
     * Spend one token by value, atomically via `$pull` rather than loading `tokens` and calling
     * `save()`. The reset-confirm flow saves the same document twice (password, then token), so
     * two simultaneous confirms both loaded version V and the second `save()` raised a
     * `VersionError` — a 500 on a request that had already succeeded. Idempotent: pulling an
     * already-spent token matches nothing and reports `modifiedCount: 0`. `timestamps: false`
     * since spending a token isn't a change to the account. `token` is hashed before the filter —
     * wave 3.1.
     */
    tokenRemove: (id: string, token: string) =>
        userModel
            .updateOne(
                { _id: toObjectId(id) },
                { $pull: { tokens: { token: hashToken(token) } } },
                {
                    timestamps: false
                }
            )
            .exec(),

    /**
     * Spend one token by VALUE ALONE, atomically — the single-session logout. No user id in the
     * filter: `POST /account/logout` works from the refresh cookie alone, and the cookie's value
     * is itself the proof of ownership. Idempotent like `tokenRemove`: a value no document holds
     * matches nothing and reports `modifiedCount: 0`, which logout doesn't distinguish from
     * success. `timestamps: false` — ending a session is not a change to the account. `token` is
     * hashed before both the filter and the `$pull` — wave 3.1.
     */
    tokenRemoveByValue: (token: string) => {
        const digest = hashToken(token);
        return userModel
            .updateOne(
                { 'tokens.token': digest },
                { $pull: { tokens: { token: digest } } },
                { timestamps: false }
            )
            .exec();
    },

    /**
     * Drop every expired token from every document — the housekeeping sweep. Returns a plain
     * count rather than an HTTP status: a model shouldn't decide what a failed sweep means to a
     * client, that's the service's job. `timestamps: false` — expiring a token isn't a change to
     * the account.
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
     * The holder of this token value, whatever kind it is. Deliberately untyped by kind, unlike
     * `findByToken`: this is the REVOCATION lookup the refresh flow runs, asking only whether the
     * credential still exists — narrowing by type would depend on a field the JWT itself doesn't
     * carry. Carries `AUTHENTICATABLE_FILTER` too, so a refresh cookie that survives a
     * deactivation or soft delete stops working on its very next exchange, same clause as `login`.
     * `token` is hashed before the query — wave 3.1.
     */
    findByTokenValue: (token: string) =>
        userModel.findOne({ 'tokens.token': hashToken(token), ...AUTHENTICATABLE_FILTER }).exec(),

    /**
     * Stamp a token as used, so `GET /account/sessions` can show which device is idle. A
     * POSITIONAL update (`tokens.$`): mongod evaluates it at write time, so two devices
     * refreshing at once cannot overwrite each other's array. `timestamps: false` — using a
     * session is not a change to the account. `token` is hashed before the filter — wave 3.1.
     */
    tokenTouch: (token: string) =>
        userModel
            .updateOne(
                { 'tokens.token': hashToken(token) },
                { $set: { 'tokens.$.lastUsedAt': new Date() } },
                { timestamps: false }
            )
            .exec(),

    /**
     * Revoke one refresh token by its SUBDOCUMENT id — "log out that device". The id filter
     * carries the owner as well as the session, so a leaked session id from someone else's
     * listing matches nothing and reports `modifiedCount: 0` (404). `type` is pinned to `refresh`
     * so this handle can't be turned against the other token kinds — a pending reset or delete
     * confirmation isn't a session. `timestamps: false` — ending a session isn't an account change.
     */
    sessionRemove: (id: string, sessionId: string) =>
        userModel
            .updateOne(
                { _id: toObjectId(id) },
                { $pull: { tokens: { _id: toObjectId(sessionId), type: TokenType.REFRESH } } },
                { timestamps: false }
            )
            .exec(),

    /**
     * The image digest pipeline's writeback for the `users` collection — see `ImageTarget` in
     * `kernel/registry.ts`. Conditional on `pendingImageKey` still matching `key`, so a stale or
     * duplicate job delivery can't overwrite a later upload, and a hard-deleted user is a
     * detectable miss rather than a write to nothing. `timestamps: false` — the digest finishing
     * isn't an edit the account holder made.
     */
    writebackImage: (documentId, key, urls) =>
        userModel
            .updateOne(
                { _id: toObjectId(documentId), pendingImageKey: key },
                {
                    $set: { imageUrl: urls.imageUrl, thumbnailUrl: urls.thumbnailUrl },
                    $unset: { pendingImageKey: '' }
                },
                { timestamps: false }
            )
            .exec()
            .then(({ matchedCount }) => matchedCount > 0)
};
