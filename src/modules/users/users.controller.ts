import { Controller, Get, Post, Put, Delete, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { JwtAuthGuard } from '@guards/jwt-auth.guard';
import { AdminGuard } from '@guards/admin.guard';
import type { SearchUsersRequest, CreateUserRequest, UpdateUserRequest, UpdateUserByIdRequest, DeleteUserRequest } from '@api/api';

/**
 * Users controller – admin-only user management.
 * Replaces src/controllers/users.ts + src/routes/users.ts.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UsersController {
    /**
     * POST /users/search
     * Search users via JSON body (admin).
     * Declared before /:id to prevent "search" from being captured as an id param.
     */
    @Post('search')
    async searchUsers(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as SearchUsersRequest;
        const result = await UserService.search(body);
        successResponse(response, result);
    }

    /**
     * GET /users
     * List/search users via query parameters (admin).
     */
    @Get()
    async listUsers(@Req() request: Request, @Res() response: Response): Promise<void> {
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
    }

    /**
     * POST /users
     * Create a new user (admin).
     */
    @Post()
    async createUser(@Req() request: Request, @Res() response: Response): Promise<void> {
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
    }

    /**
     * PUT /users
     * Update a user by id in the request body (admin).
     */
    @Put()
    async updateUser(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as UpdateUserRequest;
        if (!body.id) {
            rejectResponse(response, 422, 'updateUser - missing id', [t('generic.error-missing-data')]);
            return;
        }
        try {
            const user = await UserService.adminUpdate(body.id, body);
            successResponse(response, user.toObject());
        } catch (error) {
            const message = (error as Error).message;
            if (message === '404')
                rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
            else
                rejectResponse(response, 500, 'Internal Server Error', [message]);
        }
    }

    /**
     * DELETE /users
     * Delete a user by id in the request body (admin).
     */
    @Delete()
    async deleteUser(@Req() request: Request, @Res() response: Response): Promise<void> {
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
        successResponse(response, undefined, 200, result.message);
    }

    /**
     * GET /users/:id
     * Get a single user by path id (admin).
     */
    @Get(':id')
    async getUserById(@Req() request: Request, @Res() response: Response): Promise<void> {
        const user = await UserService.getById(String(request.params.id));
        if (!user) {
            rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
            return;
        }
        successResponse(response, user);
    }

    /**
     * PUT /users/:id
     * Update a user by path id (admin).
     */
    @Put(':id')
    async updateUserById(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as UpdateUserByIdRequest;
        try {
            const user = await UserService.adminUpdate(String(request.params.id), body);
            successResponse(response, user.toObject());
        } catch (error) {
            const message = (error as Error).message;
            if (message === '404')
                rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
            else
                rejectResponse(response, 500, 'Internal Server Error', [message]);
        }
    }

    /**
     * DELETE /users/:id
     * Delete a user by path id (admin).
     */
    @Delete(':id')
    async deleteUserById(@Req() request: Request, @Res() response: Response): Promise<void> {
        const hardDelete = request.query.hardDelete === 'true';
        const result = await UserService.remove(String(request.params.id), hardDelete);
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, undefined, 200, result.message);
    }
}
