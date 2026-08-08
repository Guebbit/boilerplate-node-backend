import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import { logger } from '@core/adapters/logger';
import { type User } from '@types';
import { applySerialization } from './serialize';
export { zodUserSchema } from './user-validation';

/**
 * Token types used in jwt-auth
 */
export enum ETokenType {
    REFRESH = 'refresh',
    PASSWORD_RESET = 'password'
}

/**
 * Cart Item interface
 * Reference to product and quantity
 */
export interface ICartItem {
    /**
     * Reference to the product. Always an id.
     *
     * `populate('cart.items.product')` swaps a document in here at runtime, so no consumer may
     * read this field expecting either shape — `readCartLines` in `@services/cart` is the one
     * place that populates, and it returns the id and the joined product as separate fields.
     */
    product: Types.ObjectId;
    quantity: number;
}

/**
 * User tokens
 * Token is like an ID, but not really an ID
 */
export interface IToken {
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
     * Cart management through items
     */
    cart: {
        items: ICartItem[];
        updatedAt: Date;
    };

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
    tokenAdd: (type: ETokenType, expirationMs: number, token: string) => Promise<string>;
    tokenRemoveAll: (type: ETokenType) => Promise<void>;
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
        // repository's *WithCredentials helpers to re-select it (see @repositories/users).
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
        cart: {
            // sub documents always have _id
            items: {
                type: [
                    {
                        product: {
                            type: Schema.Types.ObjectId,
                            ref: 'Product',
                            required: true
                        },
                        quantity: {
                            type: Number,
                            required: true
                        }
                    }
                ],
                // Guarantee every new user starts with an empty cart.
                default: []
            },
            updatedAt: {
                type: Date,
                default: Date.now
            }
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

/**
 * Add a token to this user document and persist it.
 * Returns the token string so callers can use it directly.
 */
userSchema.methods.tokenAdd = function (
    type: ETokenType,
    expirationMs: number,
    token: string
): Promise<string> {
    this.tokens.push({
        type,
        token,
        expiration: expirationMs > 0 ? new Date(Date.now() + expirationMs) : undefined
    });
    return this.save().then(() => token);
};

/**
 * Remove all tokens of the given type from this user document and persist it.
 */
userSchema.methods.tokenRemoveAll = function (type: ETokenType) {
    this.tokens = this.tokens.filter((t: IToken) => t.type !== type);
    return this.save().then(() => {});
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
 * `_id`; strips `_id`/`__v` plus the credentials and cart that must never leave the server
 * (`password`, `tokens`, `cart`). `password`/`tokens` are also `select: false` on the schema —
 * this is defense in depth, not the only guard.
 * Exported so lean results (which bypass `toJSON`) can be mapped through the
 * same logic — see @services/users `search()`.
 *
 * `active` and `deletedAt` both pass through untouched, and both are in the `User` contract —
 * they are independent facts, and an admin needs to tell a deleted account from a live one, so
 * `deletedAt` is exposed exactly as `Product` exposes it. Every route serving a `User` list is
 * admin-only, and `/account` serves the caller their own record.
 */
export const applyUserTransform = applySerialization(userSchema, {
    omit: ['password', 'tokens', 'cart']
});

/**
 * Model
 */
export const userModel = model<IUserDocument, IUserModel>('User', userSchema);
