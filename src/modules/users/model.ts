/**
 * @module
 * The user record's Mongoose schema, its Zod wire-validation twin, and the token subdocument
 * methods — long, and deliberately one file, since splitting would separate the password hash
 * hook from the `select: false` that keeps the hash off every read.
 * See: docs/modules/users.md
 */

import { model, Schema } from 'mongoose';
import type { Document, Model, Types } from 'mongoose';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { t } from '@infrastructure/i18n';
import { CreateUserBody, createUserBodyPasswordMin } from '@api/schemas.zod';
import { type User } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

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
     * The subdocument id Mongoose gives every entry in the array. Optional because a NEW entry
     * has none until written — `tokenAdd` builds the object and lets mongod assign it. It's
     * also the only part of a refresh token that may leave the server: `GET /account/sessions`
     * presents tokens as sessions, and this id is the revocation handle, since the token VALUE
     * itself is as good as a password.
     */
    _id?: Types.ObjectId;
    token: string;
    type: string;
    expiration?: Date;
    /**
     * When this token was last exchanged for an access token, absent until then — lets
     * `GET /account/sessions` show an idle session as idle rather than indistinguishable from
     * active. Only refresh tokens are ever exchanged, so one-time kinds (a pending reset, a
     * verification link) stay absent.
     */
    lastUsedAt?: Date;
}

/**
 * The full user record shape backing Mongoose documents. `createdAt`, `updatedAt` and `deletedAt`
 * are omitted from the wire `User` contract and redeclared as `Date` below — the contract carries
 * ISO strings, the document carries real dates.
 */
export interface UserRecord extends Omit<User, 'createdAt' | 'updatedAt' | 'deletedAt'> {
    /** Hashed by the pre-save hook below before it ever reaches Mongo. */
    password: string;
    // soft delete
    deletedAt?: Date;

    /*
     * Redeclared as `Date`, like `ProductDocument` and `OrderDocument`: the contract carries ISO
     * strings, `timestamps: true` writes real `Date`s. This model missed that treatment until a
     * fixture pinning `createdAt: string` surfaced the mismatch.
     */
    createdAt?: Date;
    updatedAt?: Date;

    /** The user's refresh, reset and delete-confirmation tokens — see `Token` above. */
    tokens: Token[];
}

/**
 * The full Mongoose document: `UserRecord` plus instance methods and Document guarantees.
 */
export interface UserDocument extends UserRecord, UserMethods, Document {
    /** String version of _id — provided by Mongoose's Document getter */
    id: string;

    /**
     * Document-only bookkeeping for the image digest pipeline — the quarantine key of an upload
     * still awaiting its digest job, cleared by the writeback once it completes. Never part of the
     * `User` contract, never read by a controller. See `ImageTarget` in `kernel/registry.ts`.
     */
    pendingImageKey?: string;
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
 * User Document model type. Business logic lives in the service and repository layers.
 */
export type UserModel = Model<UserDocument, unknown, UserMethods> & {};

/**
 * Zod schema for user data validation, built on the orval-generated `CreateUserBody` so only
 * fields needing custom i18n messages are overridden. Sits beside the Mongoose schema on purpose,
 * like `zodProductSchema` beside `products/model.ts` — one for the wire, one for storage.
 * Every message is a THUNK (`error: () => t(...)`), never called eagerly: this module evaluates
 * at import time, before `i18next.init()` runs in `app.ts`, so an eager call would return
 * `undefined` and Zod would silently fall back to its own English message.
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
 * The Mongoose schema for user documents — field-level comments below cover the non-obvious
 * defaults.
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
        /*
         * Set together with `imageUrl` by `readUploadedImage` — never independently, and never by
         * a client: `ThumbnailUrl` is `readOnly` on the contract. Absent for a user whose image
         * came from a remote/default url rather than an upload (see IMAGE_PIPELINE_PLAN.md).
         */
        thumbnailUrl: {
            type: String
        },
        /*
         * The quarantine key of an upload still awaiting its digest job — see the matching field
         * on `products/model.ts` for the full rationale, identical here.
         */
        pendingImageKey: {
            type: String
        },
        /**
         * The user's preferred language for work that happens when they're not present — a
         * password-reset email at 3am has no `Accept-Language` header to read from. Set at signup
         * from the negotiated request locale, editable from the user endpoints. Not validated
         * against the supported list, since `getFixedT` falls back per key and a dropped locale
         * must not make an existing user unreadable.
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
         * Whether the account is enabled — independent of `deletedAt`, matching `products`:
         * deactivation and soft-delete are separate states that produce the same effect from
         * outside. `default: true`; existing rows backfilled by
         * `db/migrations/20260808120000-user-active-column.js`.
         */
        active: {
            type: Boolean,
            default: true
        },
        /*
         * Whether the address is confirmed via the verify flow. Defaults `false` for self-signup,
         * until `POST /account/verify-confirm` flips it; `userService.create` (admin path) sets it
         * `true` since an operator typing the address in is the vouching. Informational only.
         * Existing rows backfilled by `db/migrations/20260813090000-user-verified-column.js`.
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
 * Indexes, declared on the schema so this file is the one place deciding what's indexed. Mongoose
 * creates them on connect, so a new index needs only a line below. Names are given rather than
 * derived, and that's load-bearing: Mongo identifies an index by name as much as by key, so
 * renaming one here makes a database holding the old name fail to boot rather than silently no-op.
 */
/*
 * Login and signup both look up by email. UNIQUE is a correctness constraint, not a performance
 * one: signup is check-then-insert, so two concurrent signups for one address can both read absent
 * and both insert — only the database can refuse the second write. Paired with the E11000 branch
 * in `@infrastructure/http/errors` (409, not 500) and
 * `db/migrations/20260808200000-users-email-unique.js`, which refuses to build the index on a
 * database already holding duplicates. Mongo won't silently upgrade an existing non-unique
 * `users_email`; a database that skipped the migration fails loudly at startup instead.
 */
userSchema.index({ email: 1 }, { name: 'users_email', unique: true });
/* Refresh-token verification and the reset/delete flows query by token value. */
userSchema.index({ 'tokens.token': 1 }, { name: 'users_tokens_token' });
/*
 * `deletedAt` is deliberately not indexed — nothing searches on it. The admin listing filters
 * `active` instead, and the one login query that mentions it also matches on the near-unique,
 * indexed `email`.
 */

/**
 * Pre-save hook: hashes the password with bcrypt whenever it changes, so a plaintext value never
 * reaches storage. See the bcrypt call below for the cost-factor rationale.
 */
userSchema.pre('save', function () {
    if (!this.isModified('password')) return;

    // bcrypt cost factor — 12 rounds. Higher is slower to brute-force and slower to hash; 12 is
    // the library's own recommended floor for a production login path.
    return bcrypt.hash(this.password, 12).then((hashedPassword) => {
        this.password = hashedPassword;
    });
});

/*
 * Token writes are ATOMIC UPDATES ($push/$pull), never read-modify-write. Mutating `this.tokens`
 * then `save()` would send the array as loaded: two concurrent logins each load N tokens, each
 * append one, and the second write silently overwrites the first — a session lost with no error.
 * `$push`/`$pull` are evaluated by mongod at write time, so concurrent operations compose instead
 * of clobbering. The local `this.tokens` resync below is GUARDED: `tokens` is `select: false`, so
 * an unloaded document has `this.tokens === undefined`, and pushing to it would throw *after* the
 * atomic write already succeeded — reporting failure for an operation that, in fact, worked.
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
 * Normalizes a serialized user into the OpenAPI `User` contract: `id` from `_id`, `_id`/`__v`
 * stripped, plus `password` and `tokens` — credentials that must never leave the server. Both are
 * also `select: false` on the schema; this is defense in depth, not the only guard. Exported so
 * lean results (which bypass `toJSON`) can be mapped through the same logic — see `./service`
 * `search()`. `active` and `deletedAt` pass through untouched: both are in the `User` contract,
 * and every route serving a `User` list is admin-only.
 */
export const applyUserTransform = applySerialization(userSchema, {
    omit: ['password', 'tokens']
});

/** The compiled Mongoose model. */
export const userModel = model<UserDocument, UserModel>('User', userSchema);
