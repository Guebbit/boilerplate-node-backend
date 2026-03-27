import { z } from 'zod';
import { t } from 'i18next';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { randomBytes } from 'node:crypto';
import { generateSuccess, generateReject, type IResponseSuccess, type IResponseReject } from '@utils/response';
import { databaseErrorInterpreter } from '@utils/error-helpers';
import { zodUserSchema } from '@models/users';
import type { IUser } from '@models/users';
import type { IProduct } from '@models/products';
import ProductModel from '@models/products';
import type UserModel from '@models/users';
import type { CartItemModel } from '@models/users';
import type { Order, SearchUsersRequest, UsersResponse } from '@api/api';
import UserRepository from '@repositories/users';
import CartItemRepository from '@repositories/cart-items';
import TokenRepository from '@repositories/tokens';
import OrderRepository from '@repositories/orders';

/**
 * User Service
 * Handles all business logic for the User entity.
 * Delegates raw database access to User/CartItem/Token Repositories.
 */

/**
 * Populated cart item shape — cart item row joined with product details.
 */
export interface ICartItemPopulated {
    id?: number;
    productId: number;
    quantity: number;
    product: IProduct;
}

/**
 * Get user cart populated with product details.
 *
 * @param user
 */
export const cartGet = async (user: UserModel): Promise<ICartItemPopulated[]> => {
    const items = await CartItemRepository.findByUserId(user.id) as (CartItemModel & { product?: IProduct })[];
    // Eager-load product for each item
    await Promise.all(
        items.map((item) =>
            ProductModel.findByPk(item.productId).then((p) => {
                if (p) item.product = p.toJSON() as IProduct;
            }),
        ),
    );
    return items
        .filter((item) => item.product !== undefined)
        .map((item) => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            product: item.product as IProduct,
        }));
};

/**
 * Set quantity of target product in cart
 *
 * @param user
 * @param productId
 * @param quantity
 */
export const cartItemSetById = async (user: UserModel, productId: string | number, quantity = 1): Promise<IResponseSuccess<UserModel>> => {
    const productIdNumber = Number(productId);
    const existing = await CartItemRepository.findOne({ userId: user.id, productId: productIdNumberber });
    if (existing) {
        existing.quantity = quantity;
        await existing.save();
    } else {
        await CartItemRepository.create({ userId: user.id, productId: productIdNumberber, quantity });
    }
    const refreshed = await UserRepository.findById(user.id) as UserModel;
    return generateSuccess(refreshed);
};

/**
 * Set quantity of target product in cart (by product model)
 *
 * @param user
 * @param product
 * @param quantity
 */
export const cartItemSet = (user: UserModel, product: ProductModel, quantity = 1): Promise<IResponseSuccess<UserModel>> =>
    cartItemSetById(user, product.id, quantity);

/**
 * Add quantity of target product to quantity in cart
 *
 * @param user
 * @param productId
 * @param quantity
 */
export const cartItemAddById = async (user: UserModel, productId: string | number, quantity = 1): Promise<IResponseSuccess<UserModel>> => {
    const productIdNumber = Number(productId);
    const existing = await CartItemRepository.findOne({ userId: user.id, productId: productIdNumberber });
    if (existing) {
        existing.quantity = existing.quantity + quantity;
        await existing.save();
    } else {
        await CartItemRepository.create({ userId: user.id, productId: productIdNumberber, quantity });
    }
    const refreshed = await UserRepository.findById(user.id) as UserModel;
    return generateSuccess(refreshed);
};

/**
 * Add quantity of target product to cart (by product model)
 *
 * @param user
 * @param product
 * @param quantity
 */
export const cartItemAdd = (user: UserModel, product: ProductModel, quantity = 1): Promise<IResponseSuccess<UserModel>> =>
    cartItemAddById(user, product.id, quantity);

/**
 * Remove target product from cart
 *
 * @param user
 * @param productId
 */
export const cartItemRemoveById = async (user: UserModel, productId: string | number): Promise<IResponseSuccess<UserModel>> => {
    await CartItemRepository.findOne({ userId: user.id, productId: Number(productId) })
        .then((item) => item?.destroy());
    const refreshed = await UserRepository.findById(user.id) as UserModel;
    return generateSuccess(refreshed);
};

/**
 * Remove target product from cart (by product model)
 *
 * @param user
 * @param product
 */
export const cartItemRemove = (user: UserModel, product: ProductModel): Promise<IResponseSuccess<UserModel>> =>
    cartItemRemoveById(user, product.id);

/**
 * Remove all products from cart
 *
 * @param user
 */
export const cartRemove = async (user: UserModel): Promise<IResponseSuccess<UserModel>> => {
    await CartItemRepository.deleteByUserId(user.id);
    const refreshed = await UserRepository.findById(user.id) as UserModel;
    return generateSuccess(refreshed);
};

/**
 * Create order from current user cart and empty the cart
 *
 * @param user
 */
export const orderConfirm = async (user: UserModel): Promise<IResponseSuccess<Order> | IResponseReject> => {
    try {
        const cartItems = await cartGet(user);
        if (cartItems.length === 0)
            return generateReject(409, 'empty cart', [t('generic.error-missing-data')]);

        const order = await OrderRepository.create(
            { userId: user.id, email: user.email },
            cartItems.map((item) => ({
                productId: item.productId,
                title: item.product.title,
                price: item.product.price,
                description: item.product.description,
                imageUrl: item.product.imageUrl,
                quantity: item.quantity,
            })),
        );

        await cartRemove(user);
        return generateSuccess<Order>(order as unknown as Order);
    } catch (error) {
        return generateReject(...databaseErrorInterpreter(error as Error));
    }
};

/**
 * Add a token to the user
 *
 * @param user
 * @param type
 * @param expirationTime - undefined = expire only upon use
 */
export const tokenAdd = async (user: UserModel, type: string, expirationTime?: number): Promise<string> => {
    const token = randomBytes(16).toString('hex');
    await TokenRepository.create({
        userId: user.id,
        type,
        token,
        expiration: expirationTime ? new Date(Date.now() + expirationTime) : undefined,
    });
    return token;
};

/**
 * Change user password
 *
 * @param user
 * @param password
 * @param passwordConfirm
 */
export const passwordChange = async (user: UserModel, password = '', passwordConfirm = ''): Promise<IResponseSuccess<UserModel> | IResponseReject> => {
    const parseResult = zodUserSchema
        .pick({ password: true })
        .extend({ passwordConfirm: z.string() })
        .superRefine(({ passwordConfirm: pc, password: pw }, context) => {
            if (pc !== pw) {
                context.addIssue({ code: 'custom', message: t('signup.password-dont-match') });
            }
        })
        .safeParse({ password, passwordConfirm });

    if (!parseResult.success)
        return generateReject(
            400,
            'passwordChange - bad request',
            parseResult.error.issues.map(({ message }) => message),
        );

    user.password = password;
    return UserRepository.save(user)
        .then((savedUser) => generateSuccess<UserModel>(savedUser))
        .catch((error: Error) => generateReject(...databaseErrorInterpreter(error)));
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
): Promise<IResponseSuccess<UserModel> | IResponseReject> => {
    const parseResult = zodUserSchema
        .extend({ passwordConfirm: z.string() })
        .superRefine(({ passwordConfirm: pc, password: pw }, context) => {
            if (pc !== pw)
                context.addIssue({ code: 'custom', message: t('signup.password-dont-match') });
        })
        .safeParse({ email, username, imageUrl, password, passwordConfirm });

    if (!parseResult.success)
        return generateReject(
            400,
            'signup - bad request',
            parseResult.error.issues.map(({ message }) => message),
        );

    return UserRepository.findOne({ email })
        .then(async (user) => {
            if (user)
                return generateReject(409, 'signup - email already used', [t('signup.email-already-used')]);
            return generateSuccess<UserModel>(
                await UserRepository.create({ username, email, imageUrl: imageUrl ?? '', password }),
            );
        })
        .catch((error: Error) => generateReject(...databaseErrorInterpreter(error)));
};

/**
 * Login user
 *
 * @param email
 * @param password
 */
export const login = async (email?: string, password?: string): Promise<IResponseSuccess<UserModel> | IResponseReject> => {
    const parseResult = zodUserSchema
        .pick({ email: true })
        .extend({ password: z.string() })
        .safeParse({ email, password });

    if (!parseResult.success)
        return generateReject(
            400,
            'login - bad request',
            parseResult.error.issues.map(({ message }) => message),
        );

    return UserRepository.findOne({ email, deletedAt: undefined })
        .then((user) => {
            if (!user)
                return generateReject(401, 'login - wrong credentials', [t('login.wrong-data')]);
            return bcrypt.compare(password ?? '', user.password).then((doMatch) => {
                if (!doMatch)
                    return generateReject(401, 'login - wrong credentials', [t('login.wrong-data')]);
                return generateSuccess<UserModel>(user);
            });
        })
        .catch((error: Error) => generateReject(...databaseErrorInterpreter(error)));
};

/**
 * Remove a product from all users' carts by product ID
 *
 * @param id
 */
export const productRemoveFromCartsById = async (id: string | number): Promise<IResponseSuccess<undefined> | IResponseReject> => {
    try {
        const count = await CartItemRepository.deleteByProductId(Number(id));
        return generateSuccess(undefined, 200, t('ecommerce.product-was-deleted-from-all-carts', { product: id, count }));
    } catch (error) {
        return generateReject(...databaseErrorInterpreter(error as Error));
    }
};

// ---------------------------------------------------------------------------
// Admin-facing methods
// ---------------------------------------------------------------------------

/**
 * Validate user data for admin create/edit forms.
 *
 * @param userData
 * @param requirePassword
 */
export const validateData = (
    userData: Partial<Pick<IUser, 'email' | 'username' | 'password' | 'admin' | 'imageUrl'>>,
    { requirePassword = true }: { requirePassword?: boolean } = {},
): string[] => {
    const schema = requirePassword
        ? zodUserSchema.pick({ email: true, username: true, password: true })
        : zodUserSchema.pick({ email: true, username: true, password: true }).partial({ password: true });

    const parseResult = schema.safeParse(userData);
    if (!parseResult.success)
        return parseResult.error.issues.map(({ message }) => message);
    return [];
};

/**
 * Search users (DTO-friendly) — admin panel.
 *
 * @param filters
 */
export const search = async (filters: SearchUsersRequest = {}): Promise<UsersResponse> => {
    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (filters.id && String(filters.id).trim() !== '')
        where['id'] = Number(filters.id);

    if (filters.text && String(filters.text).trim() !== '') {
        const text = `%${String(filters.text).trim()}%`;
        where[Op.or as unknown as string] = [
            { email: { [Op.like]: text } },
            { username: { [Op.like]: text } },
        ];
    }

    if (filters.email && String(filters.email).trim() !== '')
        where['email'] = { [Op.like]: `%${String(filters.email).trim()}%` };

    if (filters.username && String(filters.username).trim() !== '')
        where['username'] = { [Op.like]: `%${String(filters.username).trim()}%` };

    if (filters.active !== undefined && filters.active !== null)
        where['deletedAt'] = filters.active ? undefined : { [Op.ne]: undefined };

    const totalItems = await UserRepository.count(where);
    const items = await UserRepository.findAll(where, { skip, limit: pageSize });

    return {
        items: items as unknown as UsersResponse['items'],
        meta: {
            page,
            pageSize,
            totalItems,
            totalPages: Math.ceil(totalItems / pageSize),
        },
    };
};

/**
 * Get a single user by ID as a plain object.
 *
 * @param id
 */
export const getById = async (id?: string | number) => {
    if (!id) return;
    const user = await UserRepository.findById(id);
    if (!user) return;
    return user.toJSON() as IUser;
};

/**
 * Create a new user (admin version).
 *
 * @param data
 */
export const adminCreate = (
    data: Pick<IUser, 'email' | 'username' | 'password'> & Partial<Pick<IUser, 'admin' | 'imageUrl'>>,
): Promise<UserModel> =>
    UserRepository.create(data);

/**
 * Update an existing user by ID (admin version).
 *
 * @param id
 * @param data
 */
export const adminUpdate = async (
    id: string | number,
    data: Partial<Pick<IUser, 'email' | 'username' | 'password' | 'admin' | 'imageUrl'>>,
): Promise<UserModel> => {
    const user = await UserRepository.findById(id);
    if (!user) throw new Error('404');

    if (data.email !== undefined) user.email = data.email;
    if (data.username !== undefined) user.username = data.username;
    if (data.admin !== undefined) user.admin = data.admin;
    if (data.imageUrl !== undefined) user.imageUrl = data.imageUrl;
    if (data.password && data.password.trim().length > 0) user.password = data.password;

    return UserRepository.save(user);
};

/**
 * Remove a user by ID (soft or hard delete).
 *
 * @param id
 * @param hardDelete
 */
export const remove = async (
    id: string | number,
    hardDelete = false,
): Promise<IResponseSuccess<UserModel> | IResponseSuccess<undefined> | IResponseReject> => {
    const user = await UserRepository.findById(id);
    if (!user) return generateReject(404, '404', [t('admin.user-not-found')]);

    if (hardDelete)
        return UserRepository.deleteOne(user).then(() => generateSuccess(undefined, 200, t('admin.user-hard-deleted')));

    user.deletedAt = user.deletedAt ? undefined : new Date();
    return generateSuccess(await UserRepository.save(user), 200, t('admin.user-soft-deleted'));
};


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
    validateData,
    search,
    getById,
    adminCreate,
    adminUpdate,
    remove,
};
