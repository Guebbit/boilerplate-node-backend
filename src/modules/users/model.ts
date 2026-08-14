import { model, Schema } from 'mongoose';
import type { Document, Model, Types } from 'mongoose';
import bcrypt from 'bcrypt';
import { logger } from '@infrastructure/adapters/logger';
import { type User } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';
export { zodUserSchema } from './validation';

/**
 * Token types used in jwt-auth
 */
export enum ETokenType {
    REFRESH = 'refresh',
    PASSWORD_RESET = 'password'
}

/**
 * User tokens
 * Token is like an ID, but not really an ID
 */
export interface IToken {
    /**
     * The subdocument id Mongoose gives every entry in the array.
     *
     * Optional because a NEW entry has none until it is written — `tokenAdd` builds the object
     * and lets mongod assign it. It is also the only part of a refresh token that may leave the
     * server: `GET /account/sessions` presents tokens as sessions, and this id is the handle
     * revocation takes, precisely because the token VALUE is as good as a password.
     */
    _id?: Types.ObjectId;
    token: string;
    type: string;
    expiration?: Date;
}

/**
 * User interface
 */
/*
 * `deletedAt` is omitted from the contract type and redeclared, the same way `IProductDocument`
 * does it: the wire contract carries an ISO string, the document carries a real `Date`. It only
 * started clashing when `deletedAt` was added to the `User` schema in `openapi.yaml` — before
 * that the contract had no such field for this one to disagree with.
 */
export interface IUser extends Omit<User, 'deletedAt'> {
    /**
     * User attributes
     */
    password: string;
    // soft delete
    deletedAt?: Date;

    /**
     * Tokens
     * - reset password
     * - 2fa
     * - etc
     */
    tokens: IToken[];
}

/**
 * User Document interface
 */
export interface IUserDocument extends IUser, IUserMethods, Document {
    /** String version of _id — provided by Mongoose's Document getter */
    id: string;
}

/**
 * User Document instance methods.
 */
export type IUserMethods = {
    // `IToken['type']` rather than `ETokenType`: the enum names the two token types the JWT
    // layer knows about, while `tokens` also carries the account-deletion type the account
    // endpoints issue. The stored field is a string, and the method has to accept every value
    // that legitimately appears in it.
    tokenAdd: (type: IToken['type'], expirationMs: number, token: string) => Promise<string>;
    tokenRemoveAll: (type: IToken['type']) => Promise<void>;
};

/**
 * User Document model type.
 * Business logic is now handled by the service and repository layers.
 */
export type IUserModel = Model<IUserDocument, unknown, IUserMethods> & {
    tokenRemoveExpired(): Promise<{ status: number; success: boolean }>;
};

/**
 * User Schema
 */
export const userSchema = new Schema<IUserDocument, IUserModel, IUserMethods>(
    {
        email: {
            type: String,
            required: true,
            match: /^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[A-Za-z]{2,7}$/
        },
        username: {
            type: String,
            required: true
        },
        // `select: false` — never loaded unless a query explicitly asks for it, so even a
        // .lean() read that bypasses applyUserTransform still cannot leak the hash. Use the
        // repository's *WithCredentials helpers to re-select it (see `./repository`).
        password: {
            type: String,
            required: true,
            select: false
        },
        imageUrl: {
            type: String,
            default: process.env.NODE_DEFAULT_IMAGE_USER ?? 'https://placekitten.com/600/600'
        },
        /**
         * The user's preferred language, for work that happens when they are not here.
         *
         * `Accept-Language` answers "what language is THIS request in", which is the right
         * source for a response and the only source a stateless API needs. It cannot answer
         * "what language should the password-reset email a worker sends at 3am be in" — there is
         * no request to read. That is what this field is for. Set at signup from the negotiated
         * request locale, editable from the user endpoints.
         *
         * Not validated against the supported list: a locale that is dropped from a deployment
         * must not make an existing user unreadable, and `getFixedT` falls back per key anyway.
         */
        locale: {
            type: String,
            default: process.env.NODE_DEFAULT_LOCALE ?? 'en'
        },
        admin: {
            type: Boolean,
            default: false
        },
        /*
         * Whether the account is enabled — a real stored column, INDEPENDENT of `deletedAt`, and
         * matching products: an account can be deactivated without being deleted, and a
         * soft-deleted account still carries whatever `active` it had. What the two share is an
         * effect, not a value — a non-admin sees a record only when it is active AND not
         * soft-deleted, so from outside a deleted record behaves exactly like an inactive one.
         * (For users that guard is currently moot: the whole `/users` router is admin-only.)
         *
         * `default: true`, declared in `openapi.yaml` on both create bodies. Existing rows are
         * backfilled by `db/migrations/20260808120000-user-active-column.js`.
         */
        active: {
            type: Boolean,
            default: true
        },
        /*
         * Whether the address has been confirmed through the verify flow. Defaults to `false`
         * because the default path is self-signup, where nobody has vouched for the address yet
         * — signup sends the verification email, `POST /account/verify-confirm` flips this.
         * `userService.create` (the admin path) overrides it to `true`: an operator typing an
         * address in is the vouching. Informational only — no guard reads it — so an unverified
         * account works and the client decides what to nag about. Existing rows are backfilled
         * to `true` by `db/migrations/20260813090000-user-verified-column.js`: they predate the
         * flow, and retroactively distrusting every account that never had a chance to verify
         * would nag exactly the wrong people.
         */
        verified: {
            type: Boolean,
            default: false
        },
        // sub documents always have _id
        // `select: false` for the same reason as `password` — live refresh tokens are as good as
        // a password to anyone who reads them.
        tokens: {
            type: [
                {
                    type: {
                        type: String,
                        required: true
                    },
                    token: {
                        type: String,
                        required: true
                    },
                    expiration: {
                        type: Date,
                        required: false
                    }
                }
            ],
            select: false,
            default: []
        },
        deletedAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

/*
 * Indexes.
 *
 * Declared on the schema, which makes this the one place that decides what is indexed here.
 * Mongoose creates them when the app connects, so a new index needs nothing but a line below.
 *
 * The names are given rather than derived, and that is load-bearing. Mongo identifies an index by
 * its name as much as by its key: asking for a key it already holds, but under a different name,
 * is an error rather than a no-op, and it surfaces while the app is starting up. Every name here
 * is the one the databases already carry, so they recognise these and do nothing. Change a name
 * and existing deployments stop booting.
 */
/*
 * Login and signup both look users up by email.
 *
 * UNIQUE is a correctness constraint, not a performance one. Signup is a check-then-insert, so two
 * concurrent signups for one address both read "absent" and both insert — a double-clicked submit
 * is enough. Only the database can refuse the second write; no application check closes a gap that
 * sits between the check and the write.
 *
 * Two things support it: the E11000 branch in `@infrastructure/http/errors` (so the loser gets 409,
 * not 500), and `db/migrations/20260808200000-users-email-unique.js`, which refuses to build the
 * index on a database already holding duplicates.
 *
 * Mongo will not silently upgrade an existing non-unique `users_email`; the migration drops and
 * rebuilds it, and a database that skipped it fails loudly at startup on index-options conflict.
 */
userSchema.index({ email: 1 }, { name: 'users_email', unique: true });
/* Refresh-token verification and the reset/delete flows query by token value. */
userSchema.index({ 'tokens.token': 1 }, { name: 'users_tokens_token' });
/*
 * `deletedAt` is deliberately not indexed. Nothing searches on it: the admin listing filters the
 * `active` column instead, and the one login query that mentions it also matches on `email`,
 * which is near-unique and indexed above — so the account is found by address and its deletion
 * state read from the single document that comes back.
 */

/**
 * Hook to make edits pre saving
 *
 * Hash all passwords (if they have been changed).
 */
userSchema.pre('save', function () {
    if (!this.isModified('password')) return;

    return bcrypt.hash(this.password, 12).then((hashedPassword) => {
        this.password = hashedPassword;
    });
});

/*
 * Token writes are ATOMIC UPDATES, not read-modify-write.
 *
 * The alternative — mutating `this.tokens` and calling `this.save()` — sends the array as it
 * looked when the document was LOADED. Two concurrent logins each load N tokens, each append one,
 * and each write back N+1, so the second overwrites the first and one session is dead on arrival.
 * The user sees a login that succeeded and a next request that says they are not authenticated.
 *
 * Logging in on two devices at once is enough to reach it, and the lost write is silent on both
 * sides. (Under `optimisticConcurrency` it is not silent — it is a `VersionError`, i.e. a 500 on a
 * correct login. Neither outcome is acceptable, which is why the write shape carries the guarantee
 * rather than the error handling.)
 *
 * `$push` and `$pull` are evaluated by mongod against the document as it exists at write time, so
 * concurrent operations compose instead of clobbering: N logins produce N tokens.
 *
 * The local `this.tokens` is kept in step by hand afterwards, because callers do read it back
 * (`post-login` reads the array to build its response). `timestamps: false` on the update keeps a
 * token write from touching `updatedAt`, which is about the account, not its sessions.
 *
 * That resync is GUARDED, and the guard is not decoration. `tokens` is `select: false`, so a
 * document loaded by any query that did not ask for it has `this.tokens` **undefined** — not an
 * empty array — and `undefined.push`/`undefined.filter` throws. The throw would land *after* the
 * atomic write had already succeeded, so the caller would see a rejected promise (a 500) for an
 * operation that did in fact happen: a logout that revoked every token and then reported failure.
 * The service layer avoids it by reloading through `findByIdWithCredentials` first, but that is a
 * convention no signature enforces, and the failure it prevents is worse than the missing resync.
 * Absent locally means "not loaded", never "none exist" — so there is nothing to keep in step.
 */

/**
 * Add a token to this user document and persist it.
 * Returns the token string so callers can use it directly.
 */
userSchema.methods.tokenAdd = function (
    type: IToken['type'],
    expirationMs: number,
    token: string
): Promise<string> {
    const entry: IToken = {
        type,
        token,
        expiration: expirationMs > 0 ? new Date(Date.now() + expirationMs) : undefined
    };

    return (this.constructor as IUserModel)
        .updateOne({ _id: this._id }, { $push: { tokens: entry } }, { timestamps: false })
        .then(() => {
            // Guarded: see the note above `tokenAdd` — `tokens` is `select: false`, so an
            // unloaded array is `undefined` and pushing to it would throw after the write landed.
            this.tokens?.push(entry);
            return token;
        });
};

/**
 * Remove all tokens of the given type from this user document and persist it.
 */
userSchema.methods.tokenRemoveAll = function (type: IToken['type']) {
    return (this.constructor as IUserModel)
        .updateOne({ _id: this._id }, { $pull: { tokens: { type } } }, { timestamps: false })
        .then(() => {
            // Guarded: see the note above `tokenAdd`. The `$pull` above has already revoked the
            // tokens in the database — reporting a failure here would be a lie about a logout
            // that succeeded.
            if (this.tokens) this.tokens = this.tokens.filter((t: IToken) => t.type !== type);
        });
};

/**
 * Remove all expired tokens from every user document in the collection.
 * Returns a simple status/success envelope consumed by the controller layer.
 */
userSchema.static('tokenRemoveExpired', function (): Promise<{
    status: number;
    success: boolean;
}> {
    const now = new Date();
    const tokenExpirationPath = 'tokens.expiration';
    return this.updateMany(
        { [tokenExpirationPath]: { $lt: now } },
        { $pull: { tokens: { expiration: { $lt: now } } } }
    )
        .then(() => ({ status: 200, success: true }))
        .catch((error) => {
            logger.error({
                message: 'tokenRemoveExpired failed',
                error
            });
            return { status: 500, success: false };
        });
});

/**
 * Normalizes a serialized user into the OpenAPI `User` contract: `id` from
 * `_id`; strips `_id`/`__v` plus the credentials that must never leave the server (`password`,
 * `tokens`). Both are also `select: false` on the schema — this is defense in depth, not the only
 * guard.
 * Exported so lean results (which bypass `toJSON`) can be mapped through the
 * same logic — see `./service` `search()`.
 *
 * `active` and `deletedAt` both pass through untouched, and both are in the `User` contract —
 * they are independent facts, and an admin needs to tell a deleted account from a live one, so
 * `deletedAt` is exposed exactly as `Product` exposes it. Every route serving a `User` list is
 * admin-only, and `/account` serves the caller their own record.
 */
export const applyUserTransform = applySerialization(userSchema, {
    omit: ['password', 'tokens']
});

/**
 * Model
 */
export const userModel = model<IUserDocument, IUserModel>('User', userSchema);
