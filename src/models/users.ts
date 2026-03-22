import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { z } from "zod"
import { t } from "i18next";
import bcrypt from "bcrypt";

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
export interface IUserDocument extends IUser, Document {
}

/**
 * User Document instance methods.
 * Business logic (cart, auth, orders) is now handled by the
 * service layer (src/services/users.ts) and repository layer
 * (src/repositories/users.ts).
 */
export type IUserMethods = unknown;

/**
 * User Document model type.
 * Business logic is now handled by the service and repository layers.
 */
export type IUserModel = Model<IUserDocument, unknown, IUserMethods>;


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
 * Hash all passwords (if they have been changed)
 */
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;

    this.password = await bcrypt.hash(this.password, 12);
});

/**
 * Model
 */
export const userModel = model<IUserDocument, IUserModel>('User', userSchema);

export default userModel;