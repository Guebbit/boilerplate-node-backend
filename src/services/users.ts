import { t } from '@core/i18n';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@core/http/response';
import { zodUserSchema } from '@models/users';
import type { IUserDocument, IUser } from '@models/users';
import type { SearchUsersRequest } from '@types';
import { userRepository } from '@repositories/users';

/**
 * User Admin Service
 * Single responsibility: admin-facing user CRUD and search.
 * For cart operations use @services/cart; for auth use @services/auth.
 */

/**
 * Validate user data for admin create/edit forms.
 * Returns an array of UI-friendly error messages (empty array means valid).
 *
 * Validates the WHOLE schema, not a `.pick()` of email/username/password as it used to. The
 * pick left `admin`, `active` and `imageUrl` unchecked, so a wrong-typed value reached Mongoose
 * untouched: `POST /users` with `admin: 'not-a-boolean'` answered 500 (a CastError on save)
 * instead of the 422 the contract promises, and `active: 'not-a-boolean'` was accepted outright.
 * The schema is not strict, so unrelated body keys (`id` on a PUT) are still ignored.
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
 * No scope argument: `active` is an ordinary searchable column now, handled by the repository's
 * `searchable.booleans` like any other filter. It used to be passed through
 * `userRepository.deletedScope(filters.active)`, which rewrote it into a `deletedAt` existence
 * check — the two facts were one field then, so filtering on one always filtered the other.
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
 * Create a new user document (admin version — no email confirmation).
 */
export const adminCreate = (
    data: Pick<IUser, 'email' | 'username' | 'password'> &
        Partial<Pick<IUser, 'admin' | 'imageUrl' | 'locale'>>
): Promise<IUserDocument> => userRepository.create(data);

/**
 * Update an existing user document (admin version).
 * Returns result union instead of throwing (LSP).
 */
export const adminUpdate = (
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
 * Update an existing user by ID (admin version).
 * Fetches the document then delegates to adminUpdate().
 */
export const adminUpdateById = (
    id: string,
    data: Partial<Pick<IUser, 'email' | 'username' | 'password' | 'admin' | 'imageUrl' | 'locale'>>
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> =>
    // Credentials included: `data.password`, when present, is assigned onto this document.
    userRepository.findByIdWithCredentials(id).then((user) => {
        if (!user) return generateReject(404, 'Not Found', [t('ecommerce.user-not-found')]);
        return adminUpdate(user, data);
    });

/**
 * Remove a user document (soft or hard delete).
 * Soft delete toggles `deletedAt` (acts as a restore if already soft-deleted).
 */
export const remove = (
    user: IUserDocument,
    hardDelete = false
): Promise<IResponseSuccess<IUserDocument> | IResponseSuccess<undefined> | IResponseReject> => {
    if (hardDelete)
        return userRepository
            .deleteOne(user)
            .then(() => generateSuccess(undefined, 200, t('ecommerce.user-hard-deleted')));

    user.deletedAt = user.deletedAt ? undefined : new Date();

    return userRepository
        .save(user)
        .then((savedUser) => generateSuccess(savedUser, 200, t('ecommerce.user-soft-deleted')));
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
 * Find a user that holds a password-reset token.
 * Returns the document if found, or undefined/null if no match.
 *
 * @param token
 */
export const findByPasswordResetToken = (
    token: string
): Promise<IUserDocument | undefined | null> =>
    // Credentials included: the caller inspects the matching token entry's expiration.
    userRepository.findOneWithCredentials({ 'tokens.token': token, 'tokens.type': 'password' });

/**
 * Find a user that holds an account-deletion token.
 * Returns the document if found, or undefined/null if no match.
 *
 * @param token
 */
export const findByAccountDeleteToken = (
    token: string
): Promise<IUserDocument | undefined | null> =>
    // Credentials included: the caller inspects the matching token entry's expiration.
    userRepository.findOneWithCredentials({ 'tokens.token': token, 'tokens.type': 'delete' });

/**
 * Remove the given token from the user document and persist it.
 * Used to consume a one-time password-reset token after the reset completes.
 *
 * @param user
 * @param token
 */
export const consumeToken = (user: IUserDocument, token: string): Promise<IUserDocument> => {
    user.tokens = user.tokens.filter((tk) => tk.token !== token);
    return userRepository.save(user);
};

/**
 * Remove a user by ID (soft or hard delete).
 * Fetches the document then delegates to remove().
 */
export const removeById = (
    id: string,
    hardDelete = false
): Promise<IResponseSuccess<IUserDocument> | IResponseSuccess<undefined> | IResponseReject> =>
    userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, 'Not Found', [t('ecommerce.user-not-found')]);
        return remove(user, hardDelete);
    });

export const userService = {
    validateData,
    search,
    getById,
    adminCreate,
    adminUpdate,
    adminUpdateById,
    remove,
    removeById,
    findByEmail,
    findByPasswordResetToken,
    findByAccountDeleteToken,
    consumeToken
};
