import { z } from 'zod';
import { getCurrentLocale, t } from '@infrastructure/i18n';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import type { CastError } from 'mongoose';
import { LoginBody, UpdateAccountBody } from '@api/schemas.zod';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { zodUserSchema } from '@modules/users';
import { ETokenType } from '@modules/users';
import type { IUserDocument } from '@modules/users';
import { userRepository, userService } from '@modules/users';

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
    // Delegates to the document method the JWT layer already uses, rather than keeping a second
    // copy of "append a token" here. Both issue a `$push`, which is the property that matters:
    // the array must be APPENDED TO, never rebuilt. Rebuilding it — `user.tokens = [...]` — makes
    // mongoose write the whole array back, and a request holding a copy loaded moments earlier
    // then erases whatever was added in between. `tokens` is exactly the field where that bites,
    // because two sessions and a reset link are routinely added by different requests at once.
    return user.tokenAdd(type, expirationTime ?? 0, token);
};

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
export const validatePasswordChange = (password = '', passwordConfirm = ''): string[] => {
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
    return parseResult.error.issues.map(({ message }) => message);
};

/**
 * Change user password with validation.
 */
export const passwordChange = (
    user: IUserDocument,
    password = '',
    passwordConfirm = ''
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);

    if (errors.length > 0) return Promise.resolve(generateReject(422, errors));

    user.password = password;
    return userRepository
        .save(user)
        .then((savedUser) => generateSuccess<IUserDocument>(savedUser))
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
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
    const parseResult = zodProfileSchema.safeParse(data);

    if (!parseResult.success)
        return Promise.resolve(
            generateReject(
                422,
                parseResult.error.issues.map(({ message }) => message)
            )
        );

    return (
        userRepository
            // Credentials included: the caller may follow a successful email change with
            // `sendVerificationEmail`, which pushes a token onto this same document.
            .findByIdWithCredentials(userId)
            .then<IResponseSuccess<IUserDocument> | IResponseReject>((user) => {
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
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);
    if (errors.length > 0) return Promise.resolve(generateReject(422, errors));

    return (
        userRepository
            // `password` is select:false — comparing against it is this flow's whole point.
            .findByIdWithCredentials(userId)
            .then<IResponseSuccess<IUserDocument> | IResponseReject>((user) => {
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
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
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
        .then<IResponseSuccess<IUserDocument> | IResponseReject>((user) => {
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
                .then((createdUser) => generateSuccess<IUserDocument>(createdUser));
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));
};

/**
 * Login user by email/password.
 */
export const login = (
    email?: string,
    password?: string
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
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
                    return generateSuccess<IUserDocument>(user);
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
    type: ETokenType
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> =>
    userRepository
        // `tokens` is select:false — needed here to filter and re-save them
        .findByIdWithCredentials(userId)
        .then(
            (
                user
            ):
                | IResponseSuccess<IUserDocument>
                | IResponseReject
                | Promise<IResponseSuccess<IUserDocument>> => {
                if (!user) return generateReject(404, []);
                // `$pull` rather than filter-and-save, for the reason above read in the other
                // direction: `user.tokens = user.tokens.filter(...)` is a rebuild, so it writes
                // the whole array back and erases anything added between this function's own read
                // and its write. That window is small and cannot be opened deterministically from
                // a test, which is the argument for closing it in the implementation rather than
                // asserting about it — `$pull` describes a change, so there is no window at all.
                return user.tokenRemoveAll(type).then(() => generateSuccess<IUserDocument>(user));
            }
        )
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));

export const authService = {
    tokenAdd,
    validatePasswordChange,
    passwordChange,
    passwordChangeWithCurrent,
    updateProfile,
    signup,
    login,
    tokenRemoveAll
};
