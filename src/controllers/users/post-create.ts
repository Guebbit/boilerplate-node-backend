import type { Request, Response } from 'express';
import UserService from '@services/users';
import { rejectResponse, successResponse } from '@utils/response';
import type { CreateUserRequest } from '@api/api';

/**
 * POST /users
 * Create a new user (admin).
 */
const createUser = async (request: Request, response: Response): Promise<void> => {
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

export default createUser;
