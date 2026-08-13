import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@infrastructure/http/response';
import { zodUserSchema } from './model';
import type { IUserDocument, IUser, IToken } from './model';
import type { SearchUsersRequest } from '@types';
import { userRepository } from './repository';
import { emitDomainEvent } from '@kernel/events';
import { USER_DELETED } from './events';

/**
 * User Admin Service
 * Single responsibility: admin-facing user CRUD and search.
 * For auth — signup, login, password reset, tokens — see the `account` module.
 */

/**
 * Validate user data for admin create/edit forms.
 * Returns an array of UI-friendly error messages (empty array means valid).
 *
 * Validates the WHOLE schema, not a `.pick()` of email/username/password: a pick would leave
 * `admin`, `active` and `imageUrl` unchecked, so a wrong-typed value reaches Mongoose untouched
 * and `POST /users` with `admin: 'not-a-boolean'` answers 500 (a CastError on save) instead of
 * the 422 the contract promises. The schema is not strict, so unrelated body keys (`id` on a PUT)
 * are still ignored.
 *
 * Takes `unknown` on purpose: this is the boundary that ESTABLISHES the type, so a narrower
 * parameter would only force its callers — all holding raw request bodies — to cast on the way in.
 */
export const validateData = (userData: unknown, requirePassword = true): string[] => {
    const schema = requirePassword ? zodUserSchema : zodUserSchema.partial({ password: true });

    const parseResult = schema.safeParse(userData);
    if (!parseResult.success) return parseResult.error.issues.map(({ message }) => message);
    return [];
};

/**
 * Search users (DTO-friendly) — admin panel.
 * Uses shared search-helpers for pagination (OCP).
 *
 * No scope argument: `active` is an ordinary searchable column, handled by the repository's
 * `searchable.booleans` like any other filter, and independent of `deletedAt`.
 */
export const search = (
    filters: SearchUsersRequest = {}
): Promise<{
    items: IUserDocument[];
    meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
}> => userRepository.search(filters);

/**
 * Get a single user by ID.
 * Returns undefined when no id provided; result union otherwise (LSP).
 */
export const getById = (id?: string) => {
    if (!id) return Promise.resolve();
    return userRepository.findById(id).then((user) => user ?? undefined);
};

/**
 * Create a new user document, with no email confirmation step.
 *
 * The self-service path is `authService.signup`, which sends a verification email and leaves
 * `verified` at the schema's `false`. This one exists for the admin write endpoints, where an
 * operator vouches for the address — which is why `verified` defaults to `true` here, spread
 * first so a caller that explicitly passes one still wins.
 */
export const create = (
    data: Pick<IUser, 'email' | 'username' | 'password'> &
        Partial<Pick<IUser, 'admin' | 'imageUrl' | 'locale' | 'verified'>>
): Promise<IUserDocument> => userRepository.create({ verified: true, ...data });

/**
 * Update an existing user document.
 * Returns a result envelope instead of throwing (LSP) — the protocol every service here follows.
 */
export const update = (
    user: IUserDocument,
    data: Partial<Pick<IUser, 'email' | 'username' | 'password' | 'admin' | 'imageUrl' | 'locale'>>
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> => {
    if (data.email !== undefined) user.email = data.email;
    if (data.username !== undefined) user.username = data.username;
    if (data.admin !== undefined) user.admin = data.admin;
    if (data.imageUrl !== undefined) user.imageUrl = data.imageUrl;
    // The preference that outlives the request — see the `locale` field on the user schema.
    if (data.locale !== undefined) user.locale = data.locale;
    if (data.password && data.password.trim().length > 0) user.password = data.password;

    return userRepository.save(user).then((savedUser) => generateSuccess(savedUser));
};

/**
 * Update an existing user by ID.
 * Fetches the document then delegates to update().
 */
export const updateById = (
    id: string,
    data: Partial<Pick<IUser, 'email' | 'username' | 'password' | 'admin' | 'imageUrl' | 'locale'>>
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> =>
    // Credentials included: `data.password`, when present, is assigned onto this document.
    userRepository.findByIdWithCredentials(id).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);
        return update(user, data);
    });

/**
 * Remove a user document (soft or hard delete).
 * Soft delete toggles `deletedAt` (acts as a restore if already soft-deleted).
 *
 * A hard delete takes the cart with it. The cart is its own document keyed by `userId`, reachable
 * only through the account, so leaving it behind would strand a row nothing can ever read or
 * clean up. A soft delete keeps it, the same way it keeps everything else about the account.
 *
 * The cleanup arrives as `user.deleted`, emitted and awaited before the write: this module does not
 * know the cart exists, which is what keeps the dependency arrow pointing cart → users rather than
 * both ways. Only the hard path emits, because a soft delete is a restore waiting to happen.
 */
export const remove = (
    user: IUserDocument,
    hardDelete = false
): Promise<IResponseSuccess<IUserDocument> | IResponseSuccess<undefined> | IResponseReject> => {
    if (hardDelete)
        return emitDomainEvent(USER_DELETED, { userId: user.id })
            .then(() => userRepository.deleteOne(user))
            .then(() => generateSuccess(undefined, 200, t('users.hard-deleted')));

    user.deletedAt = user.deletedAt ? undefined : new Date();

    return userRepository
        .save(user)
        .then((savedUser) => generateSuccess(savedUser, 200, t('users.soft-deleted')));
};

/**
 * Find a user by email address.
 * Returns the document if found, or undefined if no match.
 *
 * @param email
 */
export const findByEmail = (email: string): Promise<IUserDocument | undefined | null> =>
    // Credentials included: both callers (reset-request, delete-request) immediately push a
    // token onto the document, which `select: false` would otherwise leave undefined.
    userRepository.findOneWithCredentials({ email });

/**
 * Find a user that holds a token of the given type.
 * Returns the document if found, or undefined/null if no match.
 *
 * `$elemMatch` rather than two dotted paths, and that is the whole point of the helper. Written
 * as `{ 'tokens.token': token, 'tokens.type': type }`, Mongo applies each condition to the array
 * independently: it matches a user holding the value in ONE entry and the type in ANOTHER. A user
 * with both a reset token and a delete token — the ordinary state during an account deletion —
 * is therefore returned by a lookup for either type, whichever token was supplied.
 *
 * `$elemMatch` requires both conditions to hold on the SAME entry, which is what "holds a
 * password-reset token" means. Both controllers re-check the type on the returned document, so
 * the loose filter was not reachable as a privilege escalation — but the guard was theirs, not
 * this function's, and a third caller would not have inherited it.
 *
 * Credentials included: `tokens` carries `select: false`, and every caller reads the matching
 * entry's expiration straight off the returned document.
 */
const findByToken = (
    token: string,
    type: IToken['type']
): Promise<IUserDocument | undefined | null> =>
    userRepository.findOneWithCredentials({ tokens: { $elemMatch: { token, type } } });

/**
 * Find a user that holds a password-reset token.
 * Returns the document if found, or undefined/null if no match.
 *
 * @param token
 */
export const findByPasswordResetToken = (
    token: string
): Promise<IUserDocument | undefined | null> => findByToken(token, 'password');

/**
 * Find a user that holds an account-deletion token.
 * Returns the document if found, or undefined/null if no match.
 *
 * @param token
 */
export const findByAccountDeleteToken = (
    token: string
): Promise<IUserDocument | undefined | null> => findByToken(token, 'delete');

/**
 * Find a user that holds an email-verification token.
 * Returns the document if found, or undefined/null if no match.
 *
 * @param token
 */
export const findByEmailVerifyToken = (token: string): Promise<IUserDocument | undefined | null> =>
    findByToken(token, 'verify');

/**
 * Remove the given token from the user document and persist it.
 * Used to consume a one-time password-reset token after the reset completes.
 *
 * An atomic `$pull`, not a read-modify-write, for the same reason as `tokenAdd`/`tokenRemoveAll`
 * in `./model` — and here the read-modify-write was not merely lossy, it was a 500.
 *
 * `POST /account/reset-confirm` loads the user, changes the password (one `save()`), then calls
 * this (a second `save()` of the same loaded document). Two simultaneous confirms of one token
 * therefore both loaded the document at version V, and the second `save()` to arrive found the
 * version had moved: Mongoose raised a `VersionError`, the controller's blanket `.catch()` turned
 * it into a 500, and a user who clicked a reset link twice saw a server error on a request that
 * had, in fact, already worked.
 *
 * `$pull` is evaluated by mongod against the document as it exists at write time, so a second
 * consume of an already-spent token is a no-op rather than a conflict — which is what "one-time"
 * should mean at the storage layer, rather than being enforced only by whoever read first.
 *
 * @param user - the loaded document, kept in step with the write for callers that read it back
 * @param token - the token value to spend
 */
export const consumeToken = (user: IUserDocument, token: string): Promise<boolean> =>
    userRepository.tokenRemove(user.id, token).then(({ modifiedCount }) => {
        user.tokens = user.tokens.filter((tk) => tk.token !== token);
        // `true` only for the caller whose write actually removed it. Two simultaneous uses of one
        // reset link both pass the earlier "does this token exist" read, so this is the only
        // point at which they can be told apart — see `postResetConfirm`.
        return modifiedCount > 0;
    });

/**
 * Remove a user by ID (soft or hard delete).
 * Fetches the document then delegates to remove().
 */
export const removeById = (
    id: string,
    hardDelete = false
): Promise<IResponseSuccess<IUserDocument> | IResponseSuccess<undefined> | IResponseReject> =>
    userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);
        return remove(user, hardDelete);
    });

export const userService = {
    validateData,
    search,
    getById,
    create,
    update,
    updateById,
    remove,
    removeById,
    findByEmail,
    findByPasswordResetToken,
    findByAccountDeleteToken,
    findByEmailVerifyToken,
    consumeToken
};
