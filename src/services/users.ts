import { Types } from 'mongoose';
import { z } from 'zod';
import { t } from 'i18next';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import type { CastError } from 'mongoose';
import { generateSuccess, generateReject, type IResponseSuccess, type IResponseReject } from '@utils/response';
import { databaseErrorInterpreter } from '@utils/error-helpers';
import orderModel from '@models/orders';
import type { IOrderDocument, IOrderProduct } from '@models/orders';
import { zodUserSchema } from '@models/users';
import type { IUserDocument, ICartItem } from '@models/users';
import type { IProductDocument } from '@models/products';
import type { Order } from '@api/api';
import UserRepository from '@repositories/users';

/**
 * User Service
 * Handles all business logic for the User entity.
 * Delegates raw database access to User Repository.
 */

/**
 * Get user cart populated with product details.
 * `populate` is called directly on the user document (a Mongoose Document method)
 * rather than going through the repository, since it operates on an already-fetched
 * document and follows a reference join — not a new collection query.
 *
 * @param user
 */
export const cartGet = (user: IUserDocument): Promise<ICartItem[]> =>
    user.populate('cart.items.product')
        .then(({ cart: { items = [] } }) => items);

/**
 * Set quantity of target product in cart
 *
 * @param user
 * @param id
 * @param quantity
 */
export const cartItemSetById = async (user: IUserDocument, id: string, quantity = 1): Promise<IResponseSuccess<IUserDocument>> => {
    /**
     * Check if already present
     */
    const cartProductIndex = user.cart.items
        .findIndex(item => item.product.equals(id));

    /**
     * if present: directly update the quantity
     * if not: add
     */
    if (cartProductIndex === -1)
        user.cart.items.push({
            product: new Types.ObjectId(id),
            quantity,
        });
    else
        user.cart.items[cartProductIndex].quantity = quantity;

    /**
     * Save
     */
    user.cart.updatedAt = new Date();
    return generateSuccess(await UserRepository.save(user));
};

/**
 * Set quantity of target product in cart (by product document)
 *
 * @param user
 * @param product
 * @param quantity
 */
export const cartItemSet = (user: IUserDocument, product: IProductDocument, quantity = 1): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemSetById(user, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Add quantity of target product to quantity in cart
 *
 * @param user
 * @param id
 * @param quantity
 */
export const cartItemAddById = async (user: IUserDocument, id: string, quantity = 1): Promise<IResponseSuccess<IUserDocument>> => {
    /**
     * Check if already present
     */
    const cartProductIndex = user.cart.items
        .findIndex(item => item.product.equals(id));

    /**
     * if present: directly update the quantity
     * if not: add
     */
    if (cartProductIndex === -1)
        user.cart.items.push({
            product: new Types.ObjectId(id),
            quantity,
        });
    else
        user.cart.items[cartProductIndex].quantity = user.cart.items[cartProductIndex].quantity + quantity;

    /**
     * Save
     */
    user.cart.updatedAt = new Date();
    return generateSuccess(await UserRepository.save(user));
};

/**
 * Add quantity of target product to cart (by product document)
 *
 * @param user
 * @param product
 * @param quantity
 */
export const cartItemAdd = (user: IUserDocument, product: IProductDocument, quantity = 1): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemAddById(user, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Remove target product from cart
 *
 * @param user
 * @param id
 */
export const cartItemRemoveById = async (user: IUserDocument, id: string): Promise<IResponseSuccess<IUserDocument>> => {
    user.cart.items = user.cart.items
        .filter(({ product }: ICartItem) => !product.equals(id));
    user.cart.updatedAt = new Date();
    return generateSuccess(await UserRepository.save(user));
};

/**
 * Remove target product from cart (by product document)
 *
 * @param user
 * @param product
 */
export const cartItemRemove = (user: IUserDocument, product: IProductDocument): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemRemoveById(user, (product._id as Types.ObjectId).toString());

/**
 * Remove all products from cart
 *
 * @param user
 */
export const cartRemove = async (user: IUserDocument): Promise<IResponseSuccess<IUserDocument>> => {
    user.cart = {
        items: [],
        updatedAt: new Date(),
    };
    return generateSuccess(await UserRepository.save(user));
};

/**
 * Create order from current user cart and empty the cart
 *
 * @param user
 */
export const orderConfirm = async (user: IUserDocument): Promise<IResponseSuccess<Order> | IResponseReject> => {
    try {
        const products = await cartGet(user);
        if (products.length === 0)
            return generateReject(
                409,
                'empty cart',
                [t('generic.error-missing-data')],
            );
        const order = await orderModel.create({
            userId: user._id as Types.ObjectId,
            email: user.email,
            // products is ICartItem[] after populate(); cast to IOrderProduct[] for the schema
            products: products as unknown as IOrderProduct[],
        } as Partial<IOrderDocument>);
        await cartRemove(user);
        return generateSuccess<Order>(order as unknown as Order);
    } catch (error) {
        return generateReject(...databaseErrorInterpreter(error as CastError | Error));
    }
};

/**
 * Add a token to the user
 * (like password reset)
 *
 * Tokens will be removed when consumed in the appropriate method.
 * Example: password token will be consumed in "passwordChange" service function.
 *
 * @param user
 * @param type
 * @param expirationTime - undefined = expire only upon use
 */
export const tokenAdd = async (user: IUserDocument, type: string, expirationTime?: number): Promise<string> => {
    const token = randomBytes(16).toString('hex');
    user.tokens.push({
        type,
        token,
        expiration: expirationTime ? new Date(Date.now() + expirationTime) : undefined,
    });
    // no need to wait
    return UserRepository.save(user)
        .then(() => token);
};

/**
 * Change user password
 *
 * @param user
 * @param password
 * @param passwordConfirm
 */
export const passwordChange = async (user: IUserDocument, password = '', passwordConfirm = ''): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
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
                    code: 'custom',
                    message: t('signup.password-dont-match'),
                });
            }
        })
        .safeParse({
            password,
            passwordConfirm,
        });

    /**
     * Validation error
     */
    if (!parseResult.success)
        return generateReject(
            400,
            'passwordChange - bad request',
            parseResult.error.issues.map(({ message }) => message),
        );

    /**
     * Everything is ok, change password with the requested one.
     * Encryption will be done automatically by the pre-save hook
     */
    user.password = password;
    return UserRepository.save(user)
        .then((savedUser) => generateSuccess<IUserDocument>(savedUser))
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));
};

/**
 * Register new user
 *
 * @param email
 * @param username
 * @param password
 * @param passwordConfirm
 * @param imageUrl
 */
export const signup = async (
    email: string,
    username: string,
    password: string,
    passwordConfirm: string,
    imageUrl?: string | null,
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
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
                    code: 'custom',
                    message: t('signup.password-dont-match'),
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
            'signup - bad request',
            parseResult.error.issues.map(({ message }) => message),
        );

    /**
     * Check if email is already used (user exist already probably)
     * If that's the case: return error and stop the creation process
     */
    return UserRepository.findOne({ email })
        .then(async (user) => {
            // Email already exists
            if (user)
                return generateReject(
                    409,
                    'signup - email already used',
                    [t('signup.email-already-used')],
                );
            /**
             * Everything is ok, proceed to create a new user.
             * Encryption will be done automatically by the pre-save hook
             */
            return generateSuccess<IUserDocument>(
                await UserRepository.create({
                    username,
                    email,
                    imageUrl: imageUrl ?? '',
                    password,
                }),
            );
        })
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));
};

/**
 * Login user
 *
 * @param email
 * @param password
 */
export const login = async (email?: string, password?: string): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
    /**
     * Data validation
     * Check if password and passwordConfirm are equals and compliant
     */
    const parseResult = zodUserSchema
        .pick({
            email: true,
        }).extend({
            password: z.string(),
        }).safeParse({
            email,
            password,
        });

    /**
     * Validation error
     */
    if (!parseResult.success)
        return generateReject(
            400,
            'login - bad request',
            parseResult.error.issues.map(({ message }) => message),
        );

    /**
     * Everything is ok, login the user
     */
    return UserRepository.findOne({ email, deletedAt: undefined })
        .then(user => {
            // user not found
            if (!user)
                return generateReject(
                    401,
                    'login - wrong credentials',
                    [t('login.wrong-data')],
                );
            return bcrypt
                .compare(password ?? '', user.password)
                .then(doMatch => {
                    // User found but password doesn't match
                    if (!doMatch)
                        return generateReject(
                            401,
                            'login - wrong credentials',
                            [t('login.wrong-data')],
                        );
                    return generateSuccess<IUserDocument>(user);
                });
        })
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));
};

/**
 * Remove a product from all users' carts by product ID
 *
 * @param id
 */
export const productRemoveFromCartsById = (id: string): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    UserRepository.updateMany(
        {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'cart.items.product': id,
        },
        {
            // Remove the product from their cart
            $pull: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'cart.items': {
                    product: id,
                },
            },
            // Update the cart's updatedAt timestamp
            $set: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'cart.updatedAt': new Date(),
            },
        },
    )
        .then((result) =>
            generateSuccess(
                undefined,
                200,
                t('ecommerce.product-was-deleted-from-all-carts', {
                    product: id,
                    count: result.modifiedCount,
                }),
            ),
        )
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));



export default {
    cartGet,
    cartItemSetById,
    cartItemSet,
    cartItemAddById,
    cartItemAdd,
    cartItemRemoveById,
    cartItemRemove,
    cartRemove,
    orderConfirm,
    tokenAdd,
    passwordChange,
    signup,
    login,
    productRemoveFromCartsById,
};
