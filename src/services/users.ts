/* eslint-disable unicorn/no-null */
import { z } from 'zod';
import { t } from 'i18next';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@utils/response';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
import { zodUserSchema } from '@models/users';
import type { IUserDocument, IUser } from '@models/users';
import type { SearchUsersRequest, UsersResponse } from '@types';
import { userRepository } from '@repositories/users';
import { userTokenModel } from '@models/user-tokens';
import { cartService } from '@services/cart';

const getUserId = (user: IUserDocument): number => Number((user as unknown as { id: number }).id);

export const tokenAdd = (
    user: IUserDocument,
    type: string,
    expirationTime?: number
): Promise<string> => {
    const token = randomBytes(16).toString('hex');
    return userTokenModel
        .create({
            userId: getUserId(user),
            type,
            token,
            expiration: expirationTime ? new Date(Date.now() + expirationTime) : undefined
        } as never)
        .then(() => token);
};

export const passwordChange = (
    user: IUserDocument,
    password = '',
    passwordConfirm = ''
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
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
                } as never);
            }
        })
        .safeParse({
            password,
            passwordConfirm
        });

    if (!parseResult.success)
        return Promise.resolve(
            generateReject(
                400,
                'passwordChange - bad request',
                parseResult.error.issues.map(({ message }) => message)
            )
        );

    user.password = password;
    return userRepository
        .save(user)
        .then((savedUser) => generateSuccess<IUserDocument>(savedUser))
        .catch((error: Error) => generateReject(...databaseErrorInterpreter(error)));
};

export const signup = (
    email: string,
    username: string,
    password: string,
    passwordConfirm: string,
    imageUrl?: string | null
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
    const parseResult = zodUserSchema
        .extend({
            passwordConfirm: z.string()
        })
        .superRefine(({ passwordConfirm, password }, context) => {
            if (passwordConfirm !== password)
                context.addIssue({
                    code: 'custom',
                    message: t('signup.password-dont-match')
                } as never);
        })
        .safeParse({
            email,
            username,
            imageUrl,
            password,
            passwordConfirm
        });

    if (!parseResult.success)
        return Promise.resolve(
            generateReject(
                400,
                'signup - bad request',
                parseResult.error.issues.map(({ message }) => message)
            )
        );

    return userRepository
        .findOne({ email })
        .then<IResponseSuccess<IUserDocument> | IResponseReject>((user) => {
            if (user)
                return generateReject(409, 'signup - email already used', [
                    t('signup.email-already-used')
                ]);
            return userRepository
                .create({
                    username,
                    email,
                    imageUrl: imageUrl ?? '',
                    password,
                    cart: { items: [], updatedAt: new Date() },
                    tokens: []
                })
                .then((createdUser) => generateSuccess<IUserDocument>(createdUser));
        })
        .catch((error: Error) => generateReject(...databaseErrorInterpreter(error)));
};

export const login = (
    email?: string,
    password?: string
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
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

    if (!parseResult.success)
        return Promise.resolve(
            generateReject(
                400,
                'login - bad request',
                parseResult.error.issues.map(({ message }) => message)
            )
        );

    return userRepository
        .findOne({ email, deletedAt: null })
        .then((user) => {
            if (!user)
                return generateReject(401, 'login - wrong credentials', [t('login.wrong-data')]);
            return bcrypt.compare(password ?? '', user.password).then((doMatch) => {
                if (!doMatch)
                    return generateReject(401, 'login - wrong credentials', [
                        t('login.wrong-data')
                    ]);
                return generateSuccess<IUserDocument>(user);
            });
        })
        .catch((error: Error) => generateReject(...databaseErrorInterpreter(error)));
};

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

export const search = (filters: SearchUsersRequest = {}): Promise<UsersResponse> => {
    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (filters.id && String(filters.id).trim() !== '') where.id = Number(filters.id);

    if (filters.text && String(filters.text).trim() !== '') {
        const text = String(filters.text).trim();
        where.or = [
            { email: { contains: text } },
            { username: { contains: text } }
        ];
    }

    if (filters.email && String(filters.email).trim() !== '')
        where.email = { contains: String(filters.email).trim() };

    if (filters.username && String(filters.username).trim() !== '')
        where.username = { contains: String(filters.username).trim() };

    if (filters.active !== undefined && filters.active !== null)
        where.deletedAt = filters.active ? { exists: false } : { exists: true };

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

export const getById = (id?: string) => {
    if (!id) return Promise.resolve();
    return userRepository.findById(id).then((user) => {
        if (!user) return;
        return user.toObject();
    });
};

export const adminCreate = (
    data: Pick<IUser, 'email' | 'username' | 'password'> &
        Partial<Pick<IUser, 'admin' | 'imageUrl'>>
): Promise<IUserDocument> =>
    userRepository.create({
        ...data,
        cart: { items: [], updatedAt: new Date() },
        tokens: []
    });

export const adminUpdate = (
    id: string,
    data: Partial<Pick<IUser, 'email' | 'username' | 'password' | 'admin' | 'imageUrl'>>
): Promise<IUserDocument> =>
    userRepository.findById(id).then((user) => {
        if (!user) throw new Error('404');

        if (data.email !== undefined) user.email = data.email;
        if (data.username !== undefined) user.username = data.username;
        if (data.admin !== undefined) user.admin = data.admin;
        if (data.imageUrl !== undefined) user.imageUrl = data.imageUrl;
        if (data.password && data.password.trim().length > 0) user.password = data.password;

        return userRepository.save(user);
    });

export const remove = (
    id: string,
    hardDelete = false
): Promise<IResponseSuccess<IUserDocument> | IResponseSuccess<undefined> | IResponseReject> => {
    return userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, '404', [t('admin.user-not-found')]);

        if (hardDelete)
            return userRepository
                .deleteOne(user)
                .then(() => generateSuccess(undefined, 200, t('admin.user-hard-deleted')));

        user.deletedAt = user.deletedAt ? null : new Date();

        return userRepository
            .save(user)
            .then((savedUser) => generateSuccess(savedUser, 200, t('admin.user-soft-deleted')));
    });
};

export const userService = {
    ...cartService,
    tokenAdd,
    passwordChange,
    signup,
    login,
    validateData,
    search,
    getById,
    adminCreate,
    adminUpdate,
    remove
};
