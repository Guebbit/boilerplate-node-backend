import type { Request, Response, NextFunction } from 'express';
import type { SearchUsersRequest } from '@api/api';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * GET /users
 * List users (admin only).
 */
export const listUsers = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { page, pageSize, text, id, email, username, active } = request.query;

        const filters: SearchUsersRequest = {
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            text: text as string | undefined,
            id: id as string | undefined,
            email: email as string | undefined,
            username: username as string | undefined,
            active: active === 'true' ? true : active === 'false' ? false : undefined,
        };

        const result = await UserService.search(filters);

        successResponse(response, result);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /users/:id
 * Get a single user by ID (admin only).
 */
export const getUser = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = request.params;

        const user = await UserService.getById(id as string);

        if (!user) {
            rejectResponse(response, 404, 'User not found');
            return;
        }

        const { password: _, ...safeUser } = user;
        successResponse(response, safeUser);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /users
 * Create a new user (admin only).
 */
export const createUser = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { email, username, password, admin = false, imageUrl } = request.body as {
            email: string;
            username: string;
            password: string;
            admin?: boolean;
            imageUrl?: string;
        };

        const errors = UserService.validateData({ email, username, password });
        if (errors.length > 0) {
            rejectResponse(response, 422, 'Validation failed', errors);
            return;
        }

        const user = await UserService.adminCreate({ email, username, password, admin, imageUrl });

        const userObject = user.toObject();
        delete userObject.password;

        successResponse(response, userObject, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /users/:id
 * Update an existing user (admin only).
 */
export const updateUser = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = request.params;
        const data = request.body as {
            email?: string;
            username?: string;
            password?: string;
            admin?: boolean;
            imageUrl?: string;
        };

        const errors = UserService.validateData(data, { requirePassword: false });
        if (errors.length > 0) {
            rejectResponse(response, 422, 'Validation failed', errors);
            return;
        }

        const user = await UserService.adminUpdate(id as string, data);

        const userObject = user.toObject();
        delete userObject.password;

        successResponse(response, userObject);
    } catch (error) {
        if (error instanceof Error && error.message === '404') {
            rejectResponse(response, 404, 'User not found');
            return;
        }
        next(error);
    }
};

/**
 * DELETE /users/:id
 * Delete a user (admin only, soft delete by default).
 */
export const deleteUser = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = request.params;
        const { hardDelete = false } = request.body as { hardDelete?: boolean };

        const result = await UserService.remove(id as string, hardDelete);

        if (!result.success) {
            rejectResponse(response, 404, 'User not found', result.errors);
            return;
        }

        successResponse(response, { message: 'User deleted successfully' });
    } catch (error) {
        next(error);
    }
};
