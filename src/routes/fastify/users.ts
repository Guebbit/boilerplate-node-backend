import type { FastifyPluginAsync } from 'fastify';
import { t } from 'i18next';
import UserService from '@services/users';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations-fastify';
import { successResponse, rejectResponse } from '@utils/response-fastify';
import type {
    SearchUsersRequest,
    CreateUserRequest,
    UpdateUserRequest,
    UpdateUserByIdRequest,
    DeleteUserRequest,
} from '@api/api';

/**
 * Users routes mounted at /users (admin only).
 */
const userRoutes: FastifyPluginAsync = async (fastify) => {

    // All routes require authentication + admin role
    fastify.addHook('preHandler', getAuth);
    fastify.addHook('preHandler', isAuth);
    fastify.addHook('preHandler', isAdmin);

    /**
     * POST /users/search
     * Search users via JSON body (admin).
     * Declared before /:id to avoid matching "search" as an id.
     */
    fastify.post('/search', async (request, reply) => {
        const body = (request.body ?? {}) as SearchUsersRequest;
        const result = await UserService.search(body);
        successResponse(reply, result);
    });

    /**
     * GET /users
     * List/search users via query parameters (admin).
     */
    fastify.get('/', async (request, reply) => {
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
        successResponse(reply, result);
    });

    /**
     * POST /users
     * Create a new user (admin).
     */
    fastify.post('/', async (request, reply) => {
        const body = (request.body ?? {}) as CreateUserRequest;
        const errors = UserService.validateData(body, { requirePassword: true });
        if (errors.length > 0) {
            rejectResponse(reply, 422, 'createUser - validation failed', errors);
            return;
        }
        try {
            const user = await UserService.adminCreate(body);
            successResponse(reply, user.toObject(), 201);
        } catch (error) {
            rejectResponse(reply, 500, 'Internal Server Error', [(error as Error).message]);
        }
    });

    /**
     * PUT /users
     * Update a user by id in the request body (admin).
     */
    fastify.put('/', async (request, reply) => {
        const body = (request.body ?? {}) as UpdateUserRequest;
        if (!body.id) {
            rejectResponse(reply, 422, 'updateUser - missing id', [t('generic.error-missing-data')]);
            return;
        }
        try {
            const user = await UserService.adminUpdate(body.id, body);
            successResponse(reply, user.toObject());
        } catch (error) {
            const message = (error as Error).message;
            if (message === '404')
                rejectResponse(reply, 404, 'Not Found', [t('admin.user-not-found')]);
            else
                rejectResponse(reply, 500, 'Internal Server Error', [message]);
        }
    });

    /**
     * DELETE /users
     * Delete a user by id in the request body (admin).
     */
    fastify.delete('/', async (request, reply) => {
        const body = (request.body ?? {}) as DeleteUserRequest;
        if (!body.id) {
            rejectResponse(reply, 422, 'deleteUser - missing id', [t('generic.error-missing-data')]);
            return;
        }
        const result = await UserService.remove(body.id, body.hardDelete ?? false);
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        successResponse(reply, undefined, 200, result.message);
    });

    /**
     * GET /users/:id
     * Get a single user by path id (admin).
     */
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = await UserService.getById(id);
        if (!user) {
            rejectResponse(reply, 404, 'Not Found', [t('admin.user-not-found')]);
            return;
        }
        successResponse(reply, user);
    });

    /**
     * PUT /users/:id
     * Update a user by path id (admin).
     */
    fastify.put('/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = (request.body ?? {}) as UpdateUserByIdRequest;
        try {
            const user = await UserService.adminUpdate(id, body);
            successResponse(reply, user.toObject());
        } catch (error) {
            const message = (error as Error).message;
            if (message === '404')
                rejectResponse(reply, 404, 'Not Found', [t('admin.user-not-found')]);
            else
                rejectResponse(reply, 500, 'Internal Server Error', [message]);
        }
    });

    /**
     * DELETE /users/:id
     * Delete a user by path id (admin).
     */
    fastify.delete('/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const hardDelete = (request.query as Record<string, string>).hardDelete === 'true';
        const result = await UserService.remove(id, hardDelete);
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        successResponse(reply, undefined, 200, result.message);
    });
};

export default userRoutes;
