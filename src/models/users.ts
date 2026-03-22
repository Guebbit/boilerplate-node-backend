import { model, Schema, Types } from 'mongoose';
import type { Document, Model, CastError } from 'mongoose';
import { z } from "zod"
import { t } from "i18next";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { generateSuccess, generateReject, type IResponseReject, type IResponseSuccess } from "@utils/response";
import Orders from "./orders";
import type { IProductDocument } from "./products";
import { databaseErrorInterpreter } from "@utils/error-helpers";
import { Order } from "@api/api"

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
 * User Document instance methods
 */
export interface IUserMethods {
    cartGet: () => Promise<ICartItem[]>;
    cartRemove: () => Promise<IResponseSuccess<IUserDocument>>;
    cartItemSetById: (id: string, quantity?: number) => Promise<IResponseSuccess<IUserDocument>>;
    cartItemSet: (product: IProductDocument, quantity?: number) => Promise<IResponseSuccess<IUserDocument>>;
    cartItemAddById: (id: string, quantity?: number) => Promise<IResponseSuccess<IUserDocument>>;
    cartItemAdd: (product: IProductDocument, quantity?: number) => Promise<IResponseSuccess<IUserDocument>>;
    cartItemRemoveById: (id: string) => Promise<IResponseSuccess<IUserDocument>>;
    cartItemRemove: (product: IProductDocument) => Promise<IResponseSuccess<IUserDocument>>;
    orderConfirm: () => Promise<IResponseSuccess<Order> | IResponseReject>;
    tokenAdd: (type: string, expirationTime?: number) => Promise<string>
    passwordChange: (password: string, passwordConfirm: string) => Promise<IResponseSuccess<IUserDocument> | IResponseReject>
}

/**
 * User Document static methods
 */
export interface IUserModel extends Model<IUserDocument, unknown, IUserMethods> {
    signup: (
        email: string,
        username: string,
        password: string,
        passwordConfirm: string,
        imageUrl?: string | null,
    ) => Promise<IResponseSuccess<IUserDocument> | IResponseReject>
    login: (email: string, password: string) => Promise<IResponseSuccess<IUserDocument> | IResponseReject>
    productRemoveFromCartsById: (id: string) => Promise<IResponseSuccess<undefined> | IResponseReject>
    productRemoveFromCarts: (id: string) => Promise<IResponseSuccess<undefined> | IResponseReject>
}


/**
 * User Schema
 */
export const userSchema = new Schema<IUserDocument, IUserModel, IUserMethods>({
    email: {
        type: String,
        required: true,
        match: /^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[A-Za-z]{2,7}$/
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
 * INSTANCE (schema) method
 *
 * Get user cart populated with product details
 */
userSchema.methods.cartGet = async function () {
    return this.populate('cart.items.product')
        .then(({ cart: { items = [] } }) => items);
};

/**
 * INSTANCE (schema) method
 *
 * Set quantity of target product in cart
 * @param id
 * @param quantity
 */
userSchema.methods.cartItemSetById = async function (id: string, quantity = 1): Promise<IResponseSuccess<IUserDocument>> {
    /**
     * Check if already present
     */
    const cartProductIndex = this.cart.items
        .findIndex(item => item.product.equals(id))

    /**
     * if present: directly update the quantity
     * if not: add
     */
    if (cartProductIndex === -1)
        this.cart.items.push({
            product: new Types.ObjectId(id),
            quantity
        });
    else
        this.cart.items[cartProductIndex].quantity = quantity;

    /**
     * Save
     */
    this.cart.updatedAt = new Date();
    return generateSuccess(await this.save());
};

/**
 * INSTANCE (schema) method
 *
 * @param product
 * @param quantity
 */
userSchema.methods.cartItemSet = function (product: IProductDocument, quantity = 1): Promise<IResponseSuccess<IUserDocument>> {
    return this.cartItemSetById((product._id as Types.ObjectId).toString(), quantity)
};

/**
 * INSTANCE (schema) method
 *
 * Add quantity of target product to quantity in cart
 * @param id
 * @param quantity
 */
userSchema.methods.cartItemAddById = async function (id: string, quantity = 1): Promise<IResponseSuccess<IUserDocument>> {
    /**
     * Check if already present
     */
    const cartProductIndex = this.cart.items
        .findIndex(item => item.product.equals(id))

    /**
     * if present: directly update the quantity
     * if not: add
     */
    if (cartProductIndex === -1)
        this.cart.items.push({
            product: new Types.ObjectId(id),
            quantity
        });
    else
        this.cart.items[cartProductIndex].quantity = this.cart.items[cartProductIndex].quantity + quantity;

    /**
     * Save
     */
    this.cart.updatedAt = new Date();
    return generateSuccess(await this.save());
};

/**
 * INSTANCE (schema) method
 *
 * @param product
 * @param quantity
 */
userSchema.methods.cartItemAdd = function (product: IProductDocument, quantity = 1): Promise<IResponseSuccess<IUserDocument>> {
    return this.cartItemAddById((product._id as Types.ObjectId).toString(), quantity)
};


/**
 * INSTANCE (schema) method
 * Remove target product from cart
 *
 * @param id
 */
userSchema.methods.cartItemRemoveById = async function (id: string) {
    this.cart.items = this.cart.items
        .filter(({ product }: ICartItem) => !product.equals(id));
    this.cart.updatedAt = new Date();
    return generateSuccess(await this.save());
};

/**
 * INSTANCE (schema) method
 * Remove target product from cart
 *
 * @param product
 */
userSchema.methods.cartItemRemove = async function (product) {
    return this.cartItemRemoveById((product._id as Types.ObjectId).toString())
};

/**
 * INSTANCE (schema) method
 *
 * Remove all products from cart
 */
userSchema.methods.cartRemove = async function (): Promise<IResponseSuccess<IUserDocument>> {
    this.cart = {
        items: [],
        updatedAt: new Date(),
    };
    return generateSuccess(await this.save());
};

/**
 * INSTANCE (schema) method
 *
 * Create order and empty cart
 */
userSchema.methods.orderConfirm = async function (): Promise<IResponseSuccess<Order> | IResponseReject> {
    return this.cartGet()
        .then(async (products) => {
            if (products.length === 0)
                return generateReject(
                    409,
                    "empty cart",
                    [ t('generic.error-missing-data') ]
                )
            const order = await Orders.create({
                userId: this._id.toString(),
                email: this.email,
                products
            });
            await this.cartRemove();
            return generateSuccess<Order>(order)
        })
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)))
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
userSchema.methods.tokenAdd = async function (type: string, expirationTime?: number): Promise<string> {
    const token = randomBytes(16).toString('hex');
    this.tokens.push({
        type,
        token,
        expiration: expirationTime ? new Date(Date.now() + expirationTime) : undefined,
    });
    // no need to wait
    return this.save()
        .then(() => token);
};

/**
 * INSTANCE (schema) method
 *
 * Change password
 */
userSchema.methods.passwordChange = async function (password = "", passwordConfirm = ""): Promise<IResponseSuccess<IUserDocument> | IResponseReject> {
    /**
     * Data validation
     * Check if password and passwordConfirm are equals and compliant
     */
    const parseResult = zodUserSchema
        .pick({
            password: true,
        })
        .extend({
            passwordConfirm: z.string(),
        })
        .superRefine(({ passwordConfirm, password }, context) => {
            if (passwordConfirm !== password) {
                context.addIssue({
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
        return generateReject(
            400,
            "passwordChange - bad request",
            parseResult.error.issues.map(({ message }) => message)
        )

    /**
     * Everything is ok, change password with the requested one.
     * Encryption will be done automatically by another hook
     */
    this.password = password;
    return this.save()
        .then((user) => generateSuccess<IUserDocument>(user))
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)))
}

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
userSchema.static('signup', async function (
    email: string,
    username: string,
    password: string,
    passwordConfirm: string,
    imageUrl?: string | null,
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> {
    /**
     * Data validation
     * Check if user data are compliant
     */
    const parseResult = zodUserSchema
        .extend({
            passwordConfirm: z.string(),
        })
        .superRefine(({ passwordConfirm, password }, context) => {
            if (passwordConfirm !== password)
                context.addIssue({
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
        return generateReject(
            400,
            "signup - bad request",
            parseResult.error.issues.map(({ message }) => message)
        )

    /**
     * Check if email is already used (user exist already probably)
     * If that's the case: return error and stop the creation process
     */
    return this.findOne({
        email,
    })
        .then(async (user) => {
            // Email already exists
            if (user)
                return generateReject(
                    409,
                    "signup - email already used",
                    [ t('signup.email-already-used') ]
                )
            /**
             * Everything is ok, proceed to create a new user.
             * Encryption will be done automatically by another hook
             */
            return generateSuccess<IUserDocument>(
                await this.create({
                    username,
                    email,
                    imageUrl: imageUrl ?? "",
                    password,
                })
            )
        })
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)))
});

/**
 * STATIC (Model) method
 *
 * Login user
 *
 * @param email
 * @param password
 */
userSchema.static('login', async function (email?: string, password?: string) {
    /**
     * Data validation
     * Check if password and passwordConfirm are equals and compliant
     */
    const parseResult = zodUserSchema
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
        return generateReject(
            400,
            "login - bad request",
            parseResult.error.issues.map(({ message }) => message)
        )

    /**
     * Everything is ok, login the user
     */
    return this.findOne({
        email,
        deletedAt: undefined
    })
        .then(user => {
            // user not found
            if (!user)
                return generateReject(
                    401,
                    "login - wrong credentials",
                    [ t('login.wrong-data') ]
                )
            return bcrypt
                .compare(password ?? "", user.password)
                .then(doMatch => {
                    // User found but password doesn't match
                    if (!doMatch)
                        return generateReject(
                            401,
                            "login - wrong credentials",
                            [ t('login.wrong-data') ]
                        )
                    return generateSuccess<IUserDocument>(user);
                })
        })
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)))
});


/**
 * STATIC (Model) method
 * Remove a product from all users' carts by product ID
 *
 * @param id
 */
userSchema.static('productRemoveFromCartsById', async function (id: string): Promise<IResponseSuccess<undefined> | IResponseReject> {
    return this.updateMany(
        {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "cart.items.product": id
        },
        {
            // Remove the product from their cart
            $pull: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "cart.items": {
                    product: id
                }
            },
            // Update the cart's updatedAt timestamp
            $set: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "cart.updatedAt": new Date()
            }
        }
    )
        .then((result) =>
            generateSuccess(
                undefined,
                200,
                t('ecommerce.product-was-deleted-from-all-carts', {
                    product: id,
                    count: result.modifiedCount
                })
            )
        )
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)))
});

/**
 * STATIC (Model) method
 * Remove a product from all users' carts
 *
 * @param product
 */
userSchema.static('productRemoveFromCarts', function (product: IProductDocument): Promise<IResponseSuccess<undefined> | IResponseReject> {
    return userModel.productRemoveFromCartsById((product._id as Types.ObjectId).toString());
});

/**
 * Model
 */
export const userModel = model<IUserDocument, IUserModel>('User', userSchema);

export default userModel;