import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import type { IProductDocument } from "./products";
import Orders, { IOrder } from "./orders";
import { z } from "zod"
import { t } from "i18next";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";

/**
 * Cart Item interface
 * Reference to product and quantity
 */
export interface ICartItem {
    // IProductDocument only after populate()
    product: IProductDocument['_id'] | IProductDocument;
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
export interface IUserDocument extends IUser, Document {}

/**
 * User Document methods
 */
export interface IUserMethods {
    cartGet: () => Promise<ICartItem[]>;
    cartRemove: () => Promise<IUserDocument>;
    cartItemSet: (product: IProductDocument, quantity?: number) => Promise<IUserDocument>;
    cartItemRemove: (id: string) => Promise<IUserDocument>;
    orderConfirm: () => Promise<IOrder | undefined>;
    tokenAdd: (type: string, expirationTime?: number) => string
    passwordChange: (password: string, passwordConfirm: string) => Promise<IUserDocument>
}

/**
 * Statics
 */
export interface IUserModel extends Model<IUserDocument, unknown, IUserMethods> {
    signup: (
        email: string,
        username: string,
        imageUrl: string,
        password: string,
        passwordConfirm: string
    ) => Promise<IUserDocument>
    login: (email: string, password: string) => Promise<IUserDocument>
}


/**
 * User Schema
 */
export const userSchema = new Schema<IUserDocument, IUserModel, IUserMethods>({
    email: {
        type: String,
        required: true,
        match: /^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[a-zA-Z]{2,7}$/
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
        items: [{
            product: {
                type: Schema.Types.ObjectId,
                ref: 'Product', 
                required: true
            },
            quantity: {
                type: Number, required: true
            }
        }],
        deletedAt: Date
    },
    // sub documents always have _id
    tokens: [{
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
    }],
    deletedAt: {
        type: Date
    },
}, {
    timestamps: true
});


/**
 * Zod validation schema
 */
export const ZodUserSchema =
    z.object({
        id: z.number().nullish().optional(),
        email: z
            .string({
                required_error: "Email is required",
            })
            .email("Not a valid email"),
        username: z
            .string({
                required_error: "Username is required",
            })
            .min(3, "Name is too short"),
        password: z
            .string({
                required_error: "Username is required",
            })
            .min(8, "Password is too short"),
        imageUrl: z.string().nullish().optional(),
        admin: z.boolean().nullish().optional(),
        createdAt: z.date().nullish().optional(),
        updatedAt: z.date().nullish().optional(),
    });

/**
 * INSTANCE (schema) method
 *
 * Get user cart populated with product details
 */
userSchema.methods.cartGet = async function() {
    return this.populate('cart.items.product')
        .then(({ cart: { items = [] } }) => items);
};

/**
 * INSTANCE (schema) method
 *
 * @param product
 * @param quantity
 */
userSchema.methods.cartItemSet = async function (product: IProductDocument, quantity = 1): Promise<IUserDocument> {
    /**
     * Check if already present
     */
    const cartProductIndex = this.cart.items
        .findIndex(item => item.product.toString() === product._id.toString());

    /**
     * if present: directly update the quantity
     * if not: add
     */
    if (cartProductIndex >= 0)
        this.cart.items[cartProductIndex].quantity = quantity;
    else
        this.cart.items.push({
            product: product._id,
            quantity
        });

    /**
     * Save
     */
    return this.save();
};

/**
 * INSTANCE (schema) method
 *
 * Remove target product from cart
 * @param id
 */
userSchema.methods.cartItemRemove = async function (id: string): Promise<IUserDocument> {
    this.cart.updatedAt = new Date();
    this.cart.items = this.cart.items
        .filter(({ product }: ICartItem) =>
            !product.equals(id)
        );
    return this.save();
};

/**
 * INSTANCE (schema) method
 *
 * Remove all products from cart
 */
userSchema.methods.cartRemove = async function (): Promise<IUserDocument> {
    this.cart = {
        items: [],
        updatedAt: new Date(),
    };
    return this.save();
};

/**
 * INSTANCE (schema) method
 *
 * Create order and empty cart
 */
userSchema.methods.orderConfirm = async function () {
    return this.cartGet()
        .then((products) => {
            if(products.length > 0)
                throw new Error(t('generic.error-missing-data'))
            return Orders.create({
                userId: this._id,
                email: this.email,
                products
            })
        })
        .then((order) => {
            this.cartRemove();
            return order;
        })
};

/**
 * INSTANCE (schema) method
 *
 * Add token to user
 * (like password reset)
 *
 * Tokens will be removed when consumed in the appropriate method.
 * Example: password token will be consumed in "passwordChange" method.
 *
 * @param type
 * @param expirationTime - undefined = expire only upon use
 */
userSchema.methods.tokenAdd = function (type: string, expirationTime?: number) {
    const token = randomBytes(16).toString('hex');
    if(!this.tokens)
        this.tokens = [];
    this.tokens.push({
        type,
        token,
        expiration: expirationTime ? new Date(Date.now() + expirationTime) : undefined,
    });
    // no need to wait
    this.save();
    return token;
};

/**
 * INSTANCE (schema) method
 *
 * Change password
 */
userSchema.methods.passwordChange = async function (password = "", passwordConfirm = ""): Promise<IUserDocument> {
    /**
     * Data validation
     * Check if password and passwordConfirm are equals and compliant
     */
    const parseResult = ZodUserSchema
        .pick({
            password: true,
        })
        .extend({
            passwordConfirm: z.string(),
        })
        .superRefine(({passwordConfirm, password}, ctx) => {
            if (passwordConfirm !== password) {
                ctx.addIssue({
                    code: "custom",
                    message: t("signup.password-dont-match")
                });
            }
        })
        .safeParse({
            password,
            passwordConfirm
        });

    /**
     * Validation error
     */
    if (!parseResult.success)
        return Promise.reject(
            parseResult.error.issues.reduce((errorArray, { message }) => {
                errorArray.push(message);
                return errorArray;
            }, [] as string[])
        );

    /**
     * Everything is ok, change password with the requested one.
     * Encryption will be done automatically by another hook
     */
    this.password = password;
    return this.save();
}

/**
 * Hook to make edits pre saving
 *
 * Hash all passwords (if they have been changed)
 */
userSchema.pre('save', async function(next) {
    if (!this.isModified('password'))
        return next();
    return bcrypt.hash(this.password, 12)
        .then(hashedPassword => {
            this.password = hashedPassword;
            next()
        });
});


/**
 * STATIC (Model) method
 * 
 * Register new user
 *
 * @param email
 * @param username
 * @param imageUrl
 * @param password
 * @param passwordConfirm
 */
userSchema.static('signup', async function(
    email,
    username,
    imageUrl,
    password,
    passwordConfirm
) {
    /**
     * Data validation
     * Check if user data are compliant
     */
    const parseResult = ZodUserSchema
        .extend({
            passwordConfirm: z.string(),
        })
        .superRefine(({passwordConfirm, password}, ctx) => {
            if (passwordConfirm !== password)
                ctx.addIssue({
                    code: "custom",
                    message: t("signup.password-dont-match")
                });
        }).safeParse({
            email,
            username,
            imageUrl,
            password,
            passwordConfirm,
        });

    /**
     * Validation error
     */
    if (!parseResult.success)
        return Promise.reject(
            parseResult.error.issues.reduce((errorArray, { message }) => {
                errorArray.push(message);
                return errorArray;
            }, [] as string[])
        );

    /**
     * Check if email is already used (user exist already probably)
     * If that's the case: return error and stop the creation process
     */
    return this.findOne({
        email,
    })
        .then((user) => {
            // Email already exists
            if (user)
                return Promise.reject([
                    t('signup.email-already-used')
                ]);
            /**
             * Everything is ok, proceed to create a new user.
             * Encryption will be done automatically by another hook
             */
            return this.create({
                username,
                email,
                imageUrl,
                password,
            });
        });
});

/**
 * STATIC (Model) method
 *
 * Login user
 *
 * @param email
 * @param password
 */
userSchema.static('login', async function(email?: string, password?: string) {
    /**
     * Data validation
     * Check if password and passwordConfirm are equals and compliant
     */
    const parseResult = ZodUserSchema
        .pick({
            email: true
        }).extend({
            password: z.string(),
        }).safeParse({
            email,
            password
        });

    /**
     * Validation error
     */
    if (!parseResult.success)
        return Promise.reject(
            parseResult.error.issues.reduce((errorArray, { message }) => {
                errorArray.push(message);
                return errorArray;
            }, [] as string[])
        );

    /**
     * Everything is ok, login the user
     */
    return this.findOne({
        email,
        deletedAt: null
    })
        .then(user => {
            // user not found
            if (!user)
                return Promise.reject([
                    t('login.wrong-data')
                ]);
            return bcrypt
                .compare(password || "", user.password)
                .then(doMatch => {
                    // User found but password doesn't match
                    if (!doMatch) {
                        return Promise.reject([
                            t('login.wrong-data')
                        ]);
                    }
                    return user;
                });
        });
});

/**
 * Model
 */
export default model<IUserDocument, IUserModel>('User', userSchema);