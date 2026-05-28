import { z } from 'zod';
import { t } from 'i18next';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import type { CastError } from 'mongoose';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@utils/response';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
import { zodUserSchema } from '@models/users';
import type { IUserDocument, IToken } from '@models/users';
import { ETokenType } from '@models/users';
import { userRepository } from '@repositories/users';

/**
 * Auth Service
 * Single responsibility: authentication and credential management.
 */

/**
 * Add a token to the user (e.g. password reset).
 * Tokens are consumed by the appropriate flow (passwordChange, etc.).
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
    return userRepository.save(user).then(() => token);
};

/**
 * Remove all tokens of a given type for a user (by userId).
 * Decouples from Mongoose document method.
 */
export const removeAllTokens = (userId: string, type: ETokenType): Promise<void> =>
    userRepository.findById(userId).then((user) => {
        if (!user) return;
        user.tokens = user.tokens.filter((t: IToken) => t.type !== type);
        return userRepository.save(user).then(() => {});
    });

/**
 * Change user password with validation.
 */
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
                });
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
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));
};

/**
 * Register new user.
 */
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
                });
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
                    password
                })
                .then((createdUser) => generateSuccess<IUserDocument>(createdUser));
        })
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));
};

/**
 * Login user by email/password.
 */
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
        .findOne({ email, deletedAt: undefined })
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
        .catch((error: CastError | Error) => generateReject(...databaseErrorInterpreter(error)));
};

export const authService = {
    tokenAdd,
    removeAllTokens,
    passwordChange,
    signup,
    login
};
