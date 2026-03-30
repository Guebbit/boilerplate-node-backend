import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse } from '@utils/response';
import type { SearchUsersRequest } from '../../../api/api';

/**
 * Query parameters
 */
export interface IGetAllUsersQueries {
    id?: string
    page?: string
    pageSize?: string
    text?: string
    email?: string
    username?: string
    active?: string
}

/**
 * GET /users
 * List/search users via query parameters (admin only).
 */
const getUsers = async (request: Request, response: Response): Promise<void> => {
    const { id, page, pageSize, text, email, username, active } = request.query as IGetAllUsersQueries;
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
