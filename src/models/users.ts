import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { z } from "zod"
import { t } from "i18next";
import bcrypt from "bcrypt";
import logger from "@utils/winston";

/**
 * Token types used in jwt-auth
 */
export enum ETokenType {
    REFRESH = "refresh",
    PASSWORD_RESET = "password",
}

/**
 * User roles for authorization
 */
export enum EUserRoles {
    ADMIN = "admin",
    USER = "user",
}

/**
 * Cart Item interface
 * Reference to product and quantity
 */
export interface ICartItem {
    // IProductDocument only after populate()
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
export interface IUser {
    /**
     * User attributes
     */
    email: string;
    username: string;
    password: string;
    imageUrl?: string;
    admin: boolean;
    roles: EUserRoles[];
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
export const userSchema = new Schema<IUserDocument, IUserModel, IUserMethods>({
    email: {
        type: String,
        required: true,
        match: /^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[A-Za-z]{2,7}$/
    },
    username: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true
    },
    imageUrl: {
        type: String,
        default: "https://placekitten.com/600/600"
    },
    admin: {
        type: Boolean,
        default: false,
    },
    roles: {
        type: [String],
        enum: Object.values(EUserRoles),
        default: [EUserRoles.USER],
    },
    cart: {
        // sub documents always have _id
        items: [ {
            product: {
                type: Schema.Types.ObjectId,
                ref: 'Product',
                required: true
            },
            quantity: {
                type: Number, required: true
            }
        } ],
        deletedAt: Date
    },
    // sub documents always have _id
    tokens: [ {
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
    } ],
    deletedAt: {
        type: Date
    },
}, {
    timestamps: true
});


/**
 * Zod validation schema
 */
export const zodUserSchema = z.object({
    id: z.number().nullish(),

    email: z
        .string()
        .min(1, { message: t('signup.user-field-email-required') as string })
        .email({ message: t('signup.user-field-email-invalid') as string }),

    username: z
        .string()
        .min(1, { message: t('signup.user-field-username-required') as string })
        .min(3, { message: t('signup.user-field-username-min') as string }),

    password: z
        .string()
        .min(1, { message: t('signup.user-field-password-required') as string })
        .min(8, { message: t('signup.user-field-password-min') as string }),

    imageUrl: z.string().nullish(),

    admin: z.boolean().nullish(),
    active: z.boolean().nullish(),

    createdAt: z.date().nullish(),
    updatedAt: z.date().nullish(),
    deletedAt: z.date().nullish(),
});

/**
 * Hook to make edits pre saving
 *
 * Hash all passwords (if they have been changed) and sync roles with admin flag.
 */
userSchema.pre('save', async function () {
    // Sync roles with the admin boolean flag
    if (this.isModified('admin') || this.isNew) {
        if (this.admin) {
            if (!this.roles.includes(EUserRoles.ADMIN))
                this.roles.push(EUserRoles.ADMIN);
        } else {
            this.roles = this.roles.filter(r => r !== EUserRoles.ADMIN);
        }
    }

    if (!this.isModified('password')) return;

    this.password = await bcrypt.hash(this.password, 12);
});

/**
 * Add a token to this user document and persist it.
 * Returns the token string so callers can use it directly.
 */
userSchema.methods.tokenAdd = async function (
    type: ETokenType,
    expirationMs: number,
    token: string,
): Promise<string> {
    this.tokens.push({
        type,
        token,
        expiration: expirationMs > 0 ? new Date(Date.now() + expirationMs) : undefined,
    });
    await this.save();
    return token;
};

/**
 * Remove all tokens of the given type from this user document and persist it.
 */
userSchema.methods.tokenRemoveAll = async function (type: ETokenType): Promise<void> {
    this.tokens = this.tokens.filter((t: IToken) => t.type !== type);
    await this.save();
};

/**
 * Remove all expired tokens from every user document in the collection.
 * Returns a simple status/success envelope consumed by the controller layer.
 */
userSchema.static('tokenRemoveExpired', async function (): Promise<{ status: number; success: boolean }> {
    try {
        const now = new Date();
        const tokenExpirationPath = 'tokens.expiration';
        await this.updateMany(
            { [tokenExpirationPath]: { $lt: now } },
            { $pull: { tokens: { expiration: { $lt: now } } } }
        );
        return { status: 200, success: true };
    } catch (error) {
        logger.error({
            message: 'tokenRemoveExpired failed',
            error,
        });
        return { status: 500, success: false };
    }
});

/**
 * Model
 */
export const userModel = model<IUserDocument, IUserModel>('User', userSchema);

export default userModel;
