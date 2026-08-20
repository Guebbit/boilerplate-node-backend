/**
 * The account a person manages about themselves — their profile fields, and their password.
 *
 * Split from `./authentication` along the line between PROVING an identity and MAINTAINING one:
 * login and signup answer "who is this", everything here answers "change something about the
 * account I am already authenticated as". The password sits on this side of that line because
 * every flow that writes one — the reset link, the logged-in change — is a change to an existing
 * account rather than a way into it.
 *
 * See `./index` for why this module's service is a folder.
 */

import { z } from 'zod';
import { t } from '@infrastructure/i18n';
import bcrypt from 'bcrypt';
import type { CastError } from 'mongoose';
import { UpdateAccountBody } from '@api/schemas.zod';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject,
    type ResponseErrorItem
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { zodUserSchema, userRepository, userService, type UserDocument } from '@modules/users';
import { validationErrors } from '@infrastructure/http/controller';

/**
 * Validate a new-password pair without touching the user.
 *
 * Split out of {@link passwordChange} so `reset-confirm` can check the body BEFORE it spends the
 * one-time token. The order matters: consuming the token is what resolves two simultaneous uses
 * of one reset link, so it has to happen before the password is written — but a link burned by a
 * typo'd confirmation would be a poor trade for that. Validating first means only a well-formed
 * request can spend the token.
 *
 * @returns the UI-facing messages, empty when the pair is acceptable
 */
export const validatePasswordChange = (
    password = '',
    passwordConfirm = ''
): ResponseErrorItem[] => {
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
                    message: t('account.signup.password-dont-match')
                });
            }
        })
        .safeParse({
            password,
            passwordConfirm
        });

    if (parseResult.success) return [];
    return validationErrors(parseResult.error);
};

/**
 * Change user password with validation.
 */
export const passwordChange = (
    user: UserDocument,
    password = '',
    passwordConfirm = ''
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);

    if (errors.length > 0) return Promise.resolve(generateReject(422, errors));

    user.password = password;
    return userRepository
        .save(user)
        .then((savedUser) => generateSuccess<UserDocument>(savedUser))
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));
};

/**
 * What `PUT /account` accepts, validated with this codebase's messages.
 *
 * `email` and `username` come from `zodUserSchema`, whose overrides carry the i18n thunks;
 * `locale` and `imageUrl` come straight from the generated `UpdateAccountBody`, because the
 * contract's own constraints (the BCP 47 pattern) are the whole rule and need no custom copy.
 * `.partial()` last: every field of a self-service update is optional, and an absent field means
 * "leave it alone".
 */
const zodProfileSchema = zodUserSchema
    .pick({ email: true, username: true })
    .extend({
        locale: UpdateAccountBody.shape.locale,
        imageUrl: UpdateAccountBody.shape.imageUrl
    })
    .partial();

/**
 * Update the caller's own profile — email, username, locale, image.
 *
 * Deliberately narrower than the admin `userService.update`: no `admin`, no `active`, no
 * `password`. Role and account state are the `/users` endpoints' to change, and the password has
 * its own flow ({@link passwordChangeWithCurrent}) because it must prove knowledge of the current
 * one.
 *
 * Changing the email UNVERIFIES the account before the write: the old confirmation vouched for
 * the old address, and carrying it over would let one verified mailbox launder any number of
 * addresses. The caller decides whether to start a fresh verification — the controller sends the
 * email so this function stays queue-free.
 *
 * A duplicate email surfaces as the unique index's E11000, which `rejectDatabaseEnvelope` already
 * answers as 409 — the same path signup takes, so the two flows cannot disagree about what "taken"
 * looks like.
 */
export const updateProfile = (
    userId: string,
    data: unknown
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const parseResult = zodProfileSchema.safeParse(data);

    if (!parseResult.success)
        return Promise.resolve(generateReject(422, validationErrors(parseResult.error)));

    return (
        userRepository
            // Credentials included: the caller may follow a successful email change with
            // `sendVerificationEmail`, which pushes a token onto this same document.
            .findByIdWithCredentials(userId)
            .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
                if (!user) return generateReject(404, []);

                if (parseResult.data.email !== undefined && parseResult.data.email !== user.email)
                    user.verified = false;

                return userService.update(user, parseResult.data);
            })
            .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error))
    );
};

/**
 * Change the password of a live session, gated on the current one.
 *
 * The email reset proves possession of the mailbox; this proves possession of the credential
 * being replaced. A wrong current password is a 422 with translated copy, NOT a 401 — a 401 from
 * an authenticated endpoint reads as "session expired" to every client interceptor, and would log
 * the user out of a session that is perfectly valid.
 *
 * The new pair is validated BEFORE the current password is checked. Both are pure reads so no
 * order is unsafe; this one means a mistyped confirmation costs one round-trip instead of one
 * bcrypt comparison plus one round-trip.
 */
export const passwordChangeWithCurrent = (
    userId: string,
    currentPassword = '',
    password = '',
    passwordConfirm = ''
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);
    if (errors.length > 0) return Promise.resolve(generateReject(422, errors));

    return (
        userRepository
            // `password` is select:false — comparing against it is this flow's whole point.
            .findByIdWithCredentials(userId)
            .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
                if (!user) return generateReject(404, []);

                return bcrypt.compare(currentPassword, user.password).then((doMatch) => {
                    if (!doMatch)
                        return generateReject(422, [t('account.password-change.wrong-current')]);
                    return passwordChange(user, password, passwordConfirm);
                });
            })
            .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error))
    );
};
