import { model, Schema } from 'mongoose';
import type { Document, Model, Types } from 'mongoose';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { t } from '@infrastructure/i18n';
import { CreateUserBody, createUserBodyPasswordMin } from '@api/schemas.zod';
import { type User } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

/*
 * Long, and deliberately one file: everything here describes the user record. The Zod wire schema
 * and the token methods sit beside the schema because splitting would separate the password hash
 * hook from the `select: false` that keeps the hash off every read.
 */

/**
 * Token types used in jwt-auth
 */
export enum TokenType {
    REFRESH = 'refresh',
    PASSWORD_RESET = 'password'
}

/**
 * User tokens
 * Token is like an ID, but not really an ID
 */
export interface Token {
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
    /**
     * When this token was last exchanged for an access token.
     *
     * Absent until it is, which is what lets `GET /account/sessions` show an idle session as idle
     * rather than as indistinguishable from an active one. Only refresh tokens are ever exchanged,
     * so it stays absent on the one-time kinds — a pending reset, a verification link.
     */
    lastUsedAt?: Date;
}

/**
 * User interface
 */
/*
 * `deletedAt` is omitted from the contract type and redeclared, the same way `ProductDocument`
 * does it: the wire contract carries an ISO string, the document carries a real `Date`. It only
 * started clashing when `deletedAt` was added to the `User` schema in `openapi.yaml` — before
 * that the contract had no such field for this one to disagree with.
 */
export interface UserRecord extends Omit<User, 'createdAt' | 'updatedAt' | 'deletedAt'> {
    /**
     * User attributes
     */
    password: string;
    // soft delete
    deletedAt?: Date;

    /*
     * Redeclared as `Date` for exactly the reason `deletedAt` is, and for the reason
     * `ProductDocument` and `OrderDocument` already did it: the contract carries ISO strings, the
     * schema stores `Date`s. This model was the one that never got the treatment, so it claimed
     * `createdAt: string` while `timestamps: true` wrote a `Date` into it — harmless until a
     * fixture tried to pin one, which is how it surfaced.
     */
    createdAt?: Date;
    updatedAt?: Date;

    /**
     * Tokens
     * - reset password
     * - 2fa
     * - etc
     */
    tokens: Token[];
}

/**
 * User Document interface
 */
export interface UserDocument extends UserRecord, UserMethods, Document {
    /** String version of _id — provided by Mongoose's Document getter */
    id: string;
}

/**
 * User Document instance methods.
 */
export interface UserMethods {
    // `Token['type']` rather than `TokenType`: the enum names the two token types the JWT
    // layer knows about, while `tokens` also carries the account-deletion type the account
    // endpoints issue. The stored field is a string, and the method has to accept every value
    // that legitimately appears in it.
    tokenAdd: (type: Token['type'], expirationMs: number, token: string) => Promise<string>;
    tokenRemoveAll: (type: Token['type']) => Promise<void>;
}

/**
 * User Document model type.
 * Business logic is now handled by the service and repository layers.
 */
export type UserModel = Model<UserDocument, unknown, UserMethods> & {};

/**
 * Zod Schema for user data validation.
 *
 * Built on the orval-generated `CreateUserBody` (kept in sync with `openapi.yaml`) so only fields
 * needing custom i18n messages are overridden — `admin`, `active` and `imageUrl` are inherited
 * from the generated schema and validated with it. `imageUrl` needs no override: the contract
 * declares it `uri-reference`, which is what a relative upload path is (see `resolveImageUrl`),
 * so the two agree at the source.
 *
 * Beside the Mongoose schema on purpose, exactly as `products/model.ts` carries
 * `zodProductSchema`: both describe what a valid User is, one for the wire and one for storage,
 * and a reader checking whether a rule is enforced should not have to guess which of two files
 * to open. It lived in its own `validation.ts` until then — the only module that had one.
 *
 * Every message is a THUNK — `error: () => t('…')`, never `error: t('…')`. This module is
 * evaluated at import time, which ES module semantics guarantee happens before `i18next.init()`
 * in `app.ts`'s body; an eagerly-called `t()` returns `undefined` there and Zod silently reads
 * that as "no custom message" and falls back to its own English. A thunk is called by Zod at
 * parse time instead, when i18n is up and the request's locale is known (see
 * `@infrastructure/i18n`).
 */
export const zodUserSchema = CreateUserBody.extend({
    email: z
        .email({ error: () => t('users.field-email-invalid') })
        .min(1, { error: () => t('users.field-email-required') }),

    username: z
        .string()
        .min(1, { error: () => t('users.field-username-required') })
        .min(3, { error: () => t('users.field-username-min') }),

    password: z
        .string()
        .min(1, { error: () => t('users.field-password-required') })
        .min(createUserBodyPasswordMin, { error: () => t('users.field-password-min') })
});

/**
 * User Schema
 */
export const userSchema = new Schema<UserDocument, UserModel, UserMethods>(
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
        // Self-service profile fields, no format enforced: a phone number's valid shapes vary too
        // widely by country to regex safely, and a website is free text the same way `imageUrl` is.
        phone: {
            type: String
        },
        website: {
            type: String
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
                    },
                    lastUsedAt: {
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
    type: Token['type'],
    expirationMs: number,
    token: string
): Promise<string> {
    const entry: Token = {
        type,
        token,
        expiration: expirationMs > 0 ? new Date(Date.now() + expirationMs) : undefined
    };

    return (this.constructor as UserModel)
        .updateOne({ _id: this._id }, { $push: { tokens: entry } }, { timestamps: false })
        .then(() => {
            // Guarded: see the note above `tokenAdd` — `tokens` is `select: false`, so an
            // unloaded array is `undefined` and pushing to it would throw after the write landed.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the schema types claim `tokens` is always loaded; `select: false` makes that a lie
            this.tokens?.push(entry);
            return token;
        });
};

/**
 * Remove all tokens of the given type from this user document and persist it.
 */
userSchema.methods.tokenRemoveAll = function (type: Token['type']) {
    return (this.constructor as UserModel)
        .updateOne({ _id: this._id }, { $pull: { tokens: { type } } }, { timestamps: false })
        .then(() => {
            // Guarded: see the note above `tokenAdd`. The `$pull` above has already revoked the
            // tokens in the database — reporting a failure here would be a lie about a logout
            // that succeeded.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the schema types claim `tokens` is always loaded; `select: false` makes that a lie
            if (this.tokens) this.tokens = this.tokens.filter((t: Token) => t.type !== type);
        });
};

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
export const userModel = model<UserDocument, UserModel>('User', userSchema);
