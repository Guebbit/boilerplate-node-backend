/**
 * Authentication — proving who is asking, and the tokens that keep proving it.
 *
 * Signup and login establish an identity; `tokenAdd` and `tokenRemoveAll` are the two writes
 * every flow that issues or revokes one goes through. What is deliberately NOT here is anything
 * about the credential's VALUE — hashing lives on the model's pre-save hook, signing lives in
 * `../session/jwt`, and changing a password is `./profile`'s.
 *
 * See `./index` for why this module's service is a folder.
 */

import { z } from 'zod';
import { getCurrentLocale, t } from '@infrastructure/i18n';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import type { CastError } from 'mongoose';
import { LoginBody } from '@api/schemas.zod';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { zodUserSchema, userRepository, type TokenType, type UserDocument } from '@modules/users';

/**
 * Add a token to the user (e.g. password reset).
 * Tokens are consumed by the appropriate flow (passwordChange, etc.).
 */
export const tokenAdd = (
    user: UserDocument,
    type: string,
    expirationTime?: number
): Promise<string> => {
    const token = randomBytes(16).toString('hex');
    // Delegates to the document method the JWT layer already uses, rather than keeping a second
    // copy of "append a token" here. Both issue a `$push`, which is the property that matters:
    // the array must be APPENDED TO, never rebuilt. Rebuilding it — `user.tokens = [...]` — makes
    // mongoose write the whole array back, and a request holding a copy loaded moments earlier
    // then erases whatever was added in between. `tokens` is exactly the field where that bites,
    // because two sessions and a reset link are routinely added by different requests at once.
    return user.tokenAdd(type, expirationTime ?? 0, token);
};

/**
 * Register new user.
 */
export const signup = (
    email: string,
    username: string,
    password: string,
    passwordConfirm: string,
    // Not `| null`: the contract declares `imageUrl` a string, so a null reaches zod as
    // "expected string, received null" and is rejected before the `?? ''` below could see it.
    // The caller coalesces a body-supplied null away, so `undefined` is the only absence here.
    imageUrl?: string
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const parseResult = zodUserSchema
        .extend({
            passwordConfirm: z.string()
        })
        .superRefine(({ passwordConfirm, password }, context) => {
            if (passwordConfirm !== password)
                context.addIssue({
                    code: 'custom',
                    message: t('account.signup.password-dont-match')
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
                422,
                parseResult.error.issues.map(({ message }) => message)
            )
        );

    return userRepository
        .findOne({ email })
        .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
            if (user) return generateReject(409, [t('account.signup.email-already-used')]);
            return userRepository
                .create({
                    username,
                    email,
                    imageUrl: imageUrl ?? '',
                    password,
                    // The language they signed up in, kept for work that happens later without
                    // a request to read `Accept-Language` from — a queued email, a nightly job.
                    // Editable afterwards from the user endpoints.
                    locale: getCurrentLocale()
                })
                .then((createdUser) => generateSuccess<UserDocument>(createdUser));
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));
};

/**
 * Login user by email/password.
 */
export const login = (
    email?: string,
    password?: string
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const parseResult = LoginBody.safeParse({
        email,
        password
    });

    if (!parseResult.success)
        return Promise.resolve(
            generateReject(
                422,
                parseResult.error.issues.map(({ message }) => message)
            )
        );

    return (
        userRepository
            // `password` is select:false — this is one of the few flows that legitimately needs it
            .findOneWithCredentials({ email, deletedAt: undefined })
            .then((user) => {
                if (!user) return generateReject(401, [t('account.login.wrong-data')]);

                return bcrypt.compare(password ?? '', user.password).then((doMatch) => {
                    if (!doMatch) return generateReject(401, [t('account.login.wrong-data')]);
                    return generateSuccess<UserDocument>(user);
                });
            })
            .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error))
    );
};

/**
 * Remove all tokens of a given type for the user identified by userId.
 * Used by logout-everywhere flows.
 */
export const tokenRemoveAll = (
    userId: string,
    type: TokenType
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userRepository
        // `tokens` is select:false — needed here to filter and re-save them
        .findByIdWithCredentials(userId)
        .then(
            (
                user
            ):
                | ResponseSuccess<UserDocument>
                | ResponseReject
                | Promise<ResponseSuccess<UserDocument>> => {
                if (!user) return generateReject(404, []);
                // `$pull` rather than filter-and-save, for the reason above read in the other
                // direction: `user.tokens = user.tokens.filter(...)` is a rebuild, so it writes
                // the whole array back and erases anything added between this function's own read
                // and its write. That window is small and cannot be opened deterministically from
                // a test, which is the argument for closing it in the implementation rather than
                // asserting about it — `$pull` describes a change, so there is no window at all.
                return user.tokenRemoveAll(type).then(() => generateSuccess<UserDocument>(user));
            }
        )
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));
