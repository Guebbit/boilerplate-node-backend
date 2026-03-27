import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import type { SearchUsersRequest, CreateUserRequest, UpdateUserRequest, UpdateUserByIdRequest, DeleteUserRequest } from '@api/api';

/**
 * GET /users
 * List/search users via query parameters (admin).
 */
export const listUsers = async (request: Request, response: Response): Promise<void> => {
    const { id, page, pageSize, text, email, username, active } = request.query as Record<string, string | undefined>;
    const filters: SearchUsersRequest = {
        id,
        text,
        email,
        username,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        active: active === undefined ? undefined : active === 'true',
    };
    const result = await UserService.search(filters);
    successResponse(response, result);
};

/**
 * POST /users
 * Create a new user (admin).
 */
export const createUser = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as CreateUserRequest;
    const errors = UserService.validateData(body, { requirePassword: true });
    if (errors.length > 0) {
        rejectResponse(response, 422, 'createUser - validation failed', errors);
        return;
    }
    try {
        const user = await UserService.adminCreate(body);
        successResponse(response, user.toObject(), 201);
    } catch (error) {
        rejectResponse(response, 500, 'Internal Server Error', [(error as Error).message]);
    }
};

/**
 * PUT /users
 * Update a user by id in the request body (admin).
 */
export const updateUser = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateUserRequest;
    if (!body.id) {
        rejectResponse(response, 422, 'updateUser - missing id', [t('generic.error-missing-data')]);
        return;
    }
    try {
        const user = await UserService.adminUpdate(body.id, body);
        successResponse(response, user.toObject());
    } catch (error) {
        const msg = (error as Error).message;
        if (msg === '404')
            rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
        else
            rejectResponse(response, 500, 'Internal Server Error', [msg]);
    }
};

/**
 * DELETE /users
 * Delete a user by id in the request body (admin).
 */
export const deleteUser = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as DeleteUserRequest;
    if (!body.id) {
        rejectResponse(response, 422, 'deleteUser - missing id', [t('generic.error-missing-data')]);
        return;
    }
    const result = await UserService.remove(body.id, body.hardDelete ?? false);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, null, 200, result.message);
};

/**
 * GET /users/:id
 * Get a single user by path id (admin).
 */
export const getUserById = async (request: Request, response: Response): Promise<void> => {
    const user = await UserService.getById(String(request.params.id));
    if (!user) {
        rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
        return;
    }
    successResponse(response, user);
};

/**
 * PUT /users/:id
 * Update a user by path id (admin).
 */
export const updateUserById = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateUserByIdRequest;
    try {
        const user = await UserService.adminUpdate(String(request.params.id), body);
        successResponse(response, user.toObject());
    } catch (error) {
        const msg = (error as Error).message;
        if (msg === '404')
            rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
        else
            rejectResponse(response, 500, 'Internal Server Error', [msg]);
    }
};

/**
 * DELETE /users/:id
 * Delete a user by path id (admin).
 */
export const deleteUserById = async (request: Request, response: Response): Promise<void> => {
    const hardDelete = request.query.hardDelete === 'true';
    const result = await UserService.remove(String(request.params.id), hardDelete);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, null, 200, result.message);
};

/**
 * POST /users/search
 * Search users via JSON body (admin).
 */
export const searchUsers = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as SearchUsersRequest;
    const result = await UserService.search(body);
    successResponse(response, result);
};
