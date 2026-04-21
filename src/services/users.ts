import { Types } from 'mongoose';
import { z } from 'zod';
import { t } from 'i18next';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import type { CastError, QueryFilter } from 'mongoose';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@utils/response';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
import type { IOrderDocument } from '@models/orders';
import { zodUserSchema } from '@models/users';
import type { IUserDocument, ICartItem, IUser } from '@models/users';
import type { IProductDocument } from '@models/products';
import type { Order, SearchUsersRequest, UsersResponse } from '@types';
import { userRepository } from '@repositories/users';
import { orderRepository } from '@repositories/orders';

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
    user.populate('cart.items.product').then(({ cart: { items = [] } }) => items);

/**
 * Get user cart with computed summary (item count, total quantity, total price).
 * Combines cartGet with aggregate calculations for use in cart response payloads.
 *
 * @param user
 */
export const cartGetWithSummary = (
    user: IUserDocument
): Promise<{
    items: ICartItem[];
    summary: { itemsCount: number; totalQuantity: number; total: number };
}> =>
    cartGet(user).then((items) => {
        let totalQuantity = 0;
        let total = 0;
        for (const item of items) {
            totalQuantity += item.quantity;
            const product = item.product as unknown as { price?: number };
            total += (product?.price ?? 0) * item.quantity;
        }
        return {
            items,
            summary: {
                itemsCount: items.length,
                totalQuantity,
                total
            }
        };
    });

/**
 * Set quantity of target product in cart
 *
 * @param user
 * @param id
 * @param quantity
 */
export const cartItemSetById = (
    user: IUserDocument,
    id: string,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> => {
    /**
     * Check if already present
     */
    const cartProductIndex = user.cart.items.findIndex((item) => item.product.equals(id));

    /**
     * if present: directly update the quantity
     * if not: add
     */
    if (cartProductIndex === -1)
        user.cart.items.push({
            product: new Types.ObjectId(id),
            quantity
        });
    else user.cart.items[cartProductIndex].quantity = quantity;

    /**
     * Save
     */
    user.cart.updatedAt = new Date();
    return userRepository.save(user).then((savedUser) => generateSuccess(savedUser));
};

/**
 * Set quantity of target product in cart (by product document)
 *
 * @param user
 * @param product
 * @param quantity
 */
export const cartItemSet = (
    user: IUserDocument,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemSetById(user, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Add quantity of target product to quantity in cart
 *
 * @param user
 * @param id
 * @param quantity
 */
export const cartItemAddById = (
    user: IUserDocument,
    id: string,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> => {
    /**
     * Check if already present
     */
    const cartProductIndex = user.cart.items.findIndex((item) => item.product.equals(id));

    /**
     * if present: directly update the quantity
     * if not: add
     */
    if (cartProductIndex === -1)
        user.cart.items.push({
            product: new Types.ObjectId(id),
            quantity
        });
    else
        user.cart.items[cartProductIndex].quantity =
            user.cart.items[cartProductIndex].quantity + quantity;

    /**
     * Save
     */
    user.cart.updatedAt = new Date();
    return userRepository.save(user).then((savedUser) => generateSuccess(savedUser));
};

/**
 * Add quantity of target product to cart (by product document)
 *
 * @param user
 * @param product
 * @param quantity
 */
export const cartItemAdd = (
    user: IUserDocument,
    product: IProductDocument,
    quantity = 1
): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemAddById(user, (product._id as Types.ObjectId).toString(), quantity);

/**
 * Remove target product from cart
 *
 * @param user
 * @param id
 */
export const cartItemRemoveById = (
    user: IUserDocument,
    id: string
): Promise<IResponseSuccess<IUserDocument>> => {
    user.cart.items = user.cart.items.filter(({ product }: ICartItem) => !product.equals(id));
    user.cart.updatedAt = new Date();
    return userRepository.save(user).then((savedUser) => generateSuccess(savedUser));
};

/**
 * Remove target product from cart (by product document)
 *
 * @param user
 * @param product
 */
export const cartItemRemove = (
    user: IUserDocument,
    product: IProductDocument
): Promise<IResponseSuccess<IUserDocument>> =>
    cartItemRemoveById(user, (product._id as Types.ObjectId).toString());

/**
 * Remove all products from cart
 *
 * @param user
 */
export const cartRemove = (user: IUserDocument): Promise<IResponseSuccess<IUserDocument>> => {
    user.cart = {
        items: [],
        updatedAt: new Date()
    };
    return userRepository.save(user).then((savedUser) => generateSuccess(savedUser));
};

/**
 * Create order from current user cart and empty the cart
 *
 * @param user
 */
export const orderConfirm = (
    user: IUserDocument
): Promise<IResponseSuccess<Order> | IResponseReject> =>
    cartGet(user)
        .then<IResponseSuccess<Order> | IResponseReject>((products) => {
            if (products.length === 0)
                return generateReject(409, 'empty cart', [t('generic.error-missing-data')]);
            return orderRepository
                .create({
                    userId: user._id as Types.ObjectId,
                    email: user.email,
                    // products is ICartItem[] after populate(); cast to Order['items'] for the schema
                    items: products as unknown as Order['items']
                } as Partial<IOrderDocument>)
                .then((order) =>
                    cartRemove(user).then(() => generateSuccess<Order>(order as unknown as Order))
                );
        })
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));

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
export const tokenAdd = (
    user: IUserDocument,
    type: string,
    expirationTime?: number
): Promise<string> => {
    const token = randomBytes(16).toString('hex');
    user.tokens.push({
        type,
        token,
        expiration: expirationTime ? new Date(Date.now() + expirationTime) : undefined
    });
    // no need to wait
    return userRepository.save(user).then(() => token);
};

/**
 * Change user password
 *
 * @param user
 * @param password
 * @param passwordConfirm
 */
export const passwordChange = (
    user: IUserDocument,
    password = '',
    passwordConfirm = ''
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
    /**
     * Data validation
     * Check if password and passwordConfirm are equals and compliant
     */
    const parseResult = zodUserSchema
        .pick({
            password: true
        })
        .extend({
            passwordConfirm: z.string()
        })
        .superRefine(({ passwordConfirm, password }, context) => {
            if (passwordConfirm !== password) {
                context.addIssue({
                    code: 'custom',
                    message: t('signup.password-dont-match')
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
        return Promise.resolve(
            generateReject(
                400,
                'passwordChange - bad request',
                parseResult.error.issues.map(({ message }) => message)
            )
        );

    /**
     * Everything is ok, change password with the requested one.
     * Encryption will be done automatically by the pre-save hook
     */
    user.password = password;
    return userRepository
        .save(user)
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
export const signup = (
    email: string,
    username: string,
    password: string,
    passwordConfirm: string,
    imageUrl?: string | null
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
    /**
     * Data validation
     * Check if user data are compliant
     */
    const parseResult = zodUserSchema
        .extend({
            passwordConfirm: z.string()
        })
        .superRefine(({ passwordConfirm, password }, context) => {
            if (passwordConfirm !== password)
                context.addIssue({
                    code: 'custom',
                    message: t('signup.password-dont-match')
                });
        })
        .safeParse({
            email,
            username,
            imageUrl,
            password,
            passwordConfirm
        });

    /**
     * Validation error
     */
    if (!parseResult.success)
        return Promise.resolve(
            generateReject(
                400,
                'signup - bad request',
                parseResult.error.issues.map(({ message }) => message)
            )
        );

    /**
     * Check if email is already used (user exist already probably)
     * If that's the case: return error and stop the creation process
     */
    return userRepository
        .findOne({ email })
        .then<IResponseSuccess<IUserDocument> | IResponseReject>((user) => {
            // Email already exists
            if (user)
                return generateReject(409, 'signup - email already used', [
                    t('signup.email-already-used')
                ]);
            /**
             * Everything is ok, proceed to create a new user.
             * Encryption will be done automatically by the pre-save hook
             */
            return userRepository
                .create({
                    username,
                    email,
                    imageUrl: imageUrl ?? '',
                    password
                })
                .then((createdUser) => generateSuccess<IUserDocument>(createdUser));
        })
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));
};

/**
 * Login user
 *
 * @param email
 * @param password
 */
export const login = (
    email?: string,
    password?: string
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
    /**
     * Data validation
     * Check if password and passwordConfirm are equals and compliant
     */
    const parseResult = zodUserSchema
        .pick({
            email: true
        })
        .extend({
            password: z.string()
        })
        .safeParse({
            email,
            password
        });

    /**
     * Validation error
     */
    if (!parseResult.success)
        return Promise.resolve(
            generateReject(
                400,
                'login - bad request',
                parseResult.error.issues.map(({ message }) => message)
            )
        );

    /**
     * Everything is ok, login the user
     */
    return userRepository
        .findOne({ email, deletedAt: undefined })
        .then((user) => {
            // user not found
            if (!user)
                return generateReject(401, 'login - wrong credentials', [t('login.wrong-data')]);

            return bcrypt.compare(password ?? '', user.password).then((doMatch) => {
                // User found but password doesn't match
                if (!doMatch)
                    return generateReject(401, 'login - wrong credentials', [
                        t('login.wrong-data')
                    ]);
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
export const productRemoveFromCartsById = (
    id: string
): Promise<IResponseSuccess<undefined> | IResponseReject> =>
    userRepository
        .updateMany(
            {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'cart.items.product': id
            },
            {
                // Remove the product from their cart
                $pull: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'cart.items': {
                        product: id
                    }
                },
                // Update the cart's updatedAt timestamp
                $set: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'cart.updatedAt': new Date()
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
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));

// ---------------------------------------------------------------------------
// Admin-facing methods (mirror the pattern of src/services/products.ts)
// ---------------------------------------------------------------------------

/**
 * Validate user data for admin create/edit forms.
 * Returns an array of UI-friendly error messages (empty array means valid).
 *
 * @param userData
 * @param requirePassword - true when creating a new user (password is mandatory)
 */
export const validateData = (
    userData: Partial<Pick<IUser, 'email' | 'username' | 'password' | 'admin' | 'imageUrl'>>,
    requirePassword = true
): string[] => {
    const schema = requirePassword
        ? zodUserSchema.pick({ email: true, username: true, password: true })
        : zodUserSchema
              .pick({ email: true, username: true, password: true })
              .partial({ password: true });

    const parseResult = schema.safeParse(userData);
    if (!parseResult.success) return parseResult.error.issues.map(({ message }) => message);
    return [];
};

/**
 * Search users (DTO-friendly) — admin panel, mirrors productService.search.
 *
 * Filters: id, text (email/username), email, username
 * Pagination: page (1-based), pageSize
 *
 * Admin always sees all users (including soft-deleted).
 *
 * @param filters
 */
export const search = (filters: SearchUsersRequest = {}): Promise<UsersResponse> => {
    // Pagination
    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    // Query builder
    const where: QueryFilter<IUserDocument> = {};

    // Filter by ID
    if (filters.id && String(filters.id).trim() !== '')
        where._id = new Types.ObjectId(String(filters.id));

    // Filter by text (search in email and username)
    if (filters.text && String(filters.text).trim() !== '') {
        const text = String(filters.text).trim();
        where.$or = [
            { email: { $regex: text, $options: 'i' } },
            { username: { $regex: text, $options: 'i' } }
        ];
    }

    // Filter by exact email (overrides text $or if both provided)
    if (filters.email && String(filters.email).trim() !== '')
        where.email = { $regex: String(filters.email).trim(), $options: 'i' };

    // Filter by exact username (overrides text $or if both provided)
    if (filters.username && String(filters.username).trim() !== '')
        where.username = { $regex: String(filters.username).trim(), $options: 'i' };

    // Filter by active status (true = not deleted, false = deleted)
    if (filters.active !== undefined && filters.active !== null)
        where.deletedAt = filters.active ? { $exists: false } : { $exists: true, $type: 'date' };

    return userRepository.count(where).then((totalItems) =>
        userRepository
            .findAll(where, {
                sort: { createdAt: -1 },
                skip,
                limit: pageSize
            })
            .then((items) => ({
                items: items as unknown as UsersResponse['items'],
                meta: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize)
                }
            }))
    );
};

/**
 * Get a single user by ID as a lean (plain JS) object.
 * Returns undefined if the id is falsy; null if no matching document is found.
 *
 * @param id
 */
export const getById = (id?: string) => {
    // Return early without triggering a DB call when no id is provided
    if (!id) return Promise.resolve();
    return userRepository.findById(id).then((user) => {
        if (!user) return;
        return user.toObject();
    });
};

/**
 * Create a new user document in the database (admin version — no email confirmation).
 * Password hashing is handled automatically by the pre-save hook on the User schema.
 *
 * @param data
 */
export const adminCreate = (
    data: Pick<IUser, 'email' | 'username' | 'password'> &
        Partial<Pick<IUser, 'admin' | 'imageUrl'>>
): Promise<IUserDocument> => userRepository.create(data);

/**
 * Update an existing user by ID (admin version).
 * If password is provided and non-empty it will be changed;
 * the pre-save hook handles hashing automatically.
 *
 * @param id
 * @param data
 */
export const adminUpdate = (
    id: string,
    data: Partial<Pick<IUser, 'email' | 'username' | 'password' | 'admin' | 'imageUrl'>>
): Promise<IUserDocument> =>
    userRepository.findById(id).then((user) => {
        if (!user) throw new Error('404');

        // Apply incoming field changes
        if (data.email !== undefined) user.email = data.email;
        if (data.username !== undefined) user.username = data.username;
        if (data.admin !== undefined) user.admin = data.admin;
        if (data.imageUrl !== undefined) user.imageUrl = data.imageUrl;
        // Only update password when a non-empty value is passed
        if (data.password && data.password.trim().length > 0) user.password = data.password;

        return userRepository.save(user);
    });

/**
 * Remove a user by ID (soft or hard delete).
 * Soft delete toggles `deletedAt` (acts as a restore if already soft-deleted).
 * Hard delete permanently removes the document from the database.
 *
 * @param id
 * @param hardDelete
 */
export const remove = (
    id: string,
    hardDelete = false
): Promise<IResponseSuccess<IUserDocument> | IResponseSuccess<undefined> | IResponseReject> => {
    return userRepository.findById(id).then((user) => {
        // not found, something happened
        if (!user) return generateReject(404, '404', [t('ecommerce.user-not-found')]);

        // HARD delete
        if (hardDelete)
            return userRepository
                .deleteOne(user)
                .then(() => generateSuccess(undefined, 200, t('ecommerce.user-hard-deleted')));

        // If deletedAt already present: it's soft-deleted → RESTORE
        user.deletedAt = user.deletedAt ? undefined : new Date();

        // SOFT delete (or restore)
        return userRepository
            .save(user)
            .then((savedUser) => generateSuccess(savedUser, 200, t('ecommerce.user-soft-deleted')));
    });
};

export const userService = {
    cartGet,
    cartGetWithSummary,
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
    validateData,
    search,
    getById,
    adminCreate,
    adminUpdate,
    remove
};
