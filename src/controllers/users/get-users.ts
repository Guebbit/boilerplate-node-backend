import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse } from '@utils/response';
import type { SearchUsersRequest } from '@api/api';

/**
 * GET /users
 * List/search users via query parameters (admin).
 */
const getUsers = async (request: Request, response: Response): Promise<void> => {
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

export default getUsers;
