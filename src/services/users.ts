import { Types } from 'mongoose';
import { t } from 'i18next';
import type { CastError, QueryFilter } from 'mongoose';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@utils/response';
import { zodUserSchema } from '@models/users';
import type { IUserDocument, IUser } from '@models/users';
import type { SearchUsersRequest } from '@types';
import { userRepository } from '@repositories/users';
import {
    normalizePagination,
    buildPaginatedMeta,
    addTextFilter,
    addRegexFilter
} from '@utils/search-helpers';

/**
 * User Admin Service
 * Single responsibility: admin-facing user CRUD and search.
 * For cart operations use @services/cart; for auth use @services/auth.
 */

/**
 * Validate user data for admin create/edit forms.
 * Returns an array of UI-friendly error messages (empty array means valid).
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
 * Search users (DTO-friendly) — admin panel.
 * Uses shared search-helpers for pagination (OCP).
 */
export const search = (
    filters: SearchUsersRequest = {}
): Promise<{
    items: IUserDocument[];
    meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
}> => {
    const pagination = normalizePagination(filters);
    const where: QueryFilter<IUserDocument> = {};

    if (filters.id && String(filters.id).trim() !== '')
        where._id = new Types.ObjectId(String(filters.id));

    addTextFilter(where as Record<string, unknown>, filters.text as string | undefined, ['email', 'username']);
    addRegexFilter(where as Record<string, unknown>, 'email', filters.email as string | undefined);
    addRegexFilter(where as Record<string, unknown>, 'username', filters.username as string | undefined);

    if (filters.active !== undefined && filters.active !== null)
        where.deletedAt = filters.active ? { $exists: false } : { $exists: true, $type: 'date' };

    return userRepository.count(where).then((totalItems) =>
        userRepository
            .findAll(where, {
                sort: { createdAt: -1 },
                skip: pagination.skip,
                limit: pagination.pageSize
            })
            .then((items) => ({
                items,
                meta: buildPaginatedMeta(pagination, totalItems)
            }))
    );
};

/**
 * Get a single user by ID as a lean (plain JS) object.
 * Returns undefined when no id provided; result union otherwise (LSP).
 */
export const getById = (id?: string) => {
    if (!id) return Promise.resolve();
    return userRepository.findById(id).then((user) => {
        if (!user) return;
        return user.toObject();
    });
};

/**
 * Create a new user document (admin version — no email confirmation).
 */
export const adminCreate = (
    data: Pick<IUser, 'email' | 'username' | 'password'> &
        Partial<Pick<IUser, 'admin' | 'imageUrl'>>
): Promise<IUserDocument> => userRepository.create(data);

/**
 * Update an existing user by ID (admin version).
 * Returns result union instead of throwing (LSP).
 */
export const adminUpdate = (
    id: string,
    data: Partial<Pick<IUser, 'email' | 'username' | 'password' | 'admin' | 'imageUrl'>>
): Promise<IResponseSuccess<IUserDocument> | IResponseReject> =>
    userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, '404', [t('ecommerce.user-not-found')]);

        if (data.email !== undefined) user.email = data.email;
        if (data.username !== undefined) user.username = data.username;
        if (data.admin !== undefined) user.admin = data.admin;
        if (data.imageUrl !== undefined) user.imageUrl = data.imageUrl;
        if (data.password && data.password.trim().length > 0) user.password = data.password;

        return userRepository.save(user).then((savedUser) => generateSuccess(savedUser));
    });

/**
 * Remove a user by ID (soft or hard delete).
 * Soft delete toggles `deletedAt` (acts as a restore if already soft-deleted).
 */
export const remove = (
    id: string,
    hardDelete = false
): Promise<IResponseSuccess<IUserDocument> | IResponseSuccess<undefined> | IResponseReject> => {
    return userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, '404', [t('ecommerce.user-not-found')]);

        if (hardDelete)
            return userRepository
                .deleteOne(user)
                .then(() => generateSuccess(undefined, 200, t('ecommerce.user-hard-deleted')));

        user.deletedAt = user.deletedAt ? undefined : new Date();

        return userRepository
            .save(user)
            .then((savedUser) => generateSuccess(savedUser, 200, t('ecommerce.user-soft-deleted')));
    });
};

export const userService = {
    validateData,
    search,
    getById,
    adminCreate,
    adminUpdate,
    remove
};
