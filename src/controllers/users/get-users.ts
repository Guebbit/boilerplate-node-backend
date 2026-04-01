import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse } from '@utils/response';
import type { SearchUsersRequest } from '@types';

/**
 * GET /users
 * List/search users via query parameters (admin only).
 */
const getUsers = (request: Request, response: Response) => {
    const { id, page, pageSize, text, email, username, active } = request.query as Record<
        string,
        string | undefined
    >;
    const filters: SearchUsersRequest = {
        id,
        text,
        email,
        username,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        active: active === undefined ? undefined : active === 'true'
    };
    return UserService.search(filters).then((result) => {
        successResponse(response, result);
    });
};

export default getUsers;
