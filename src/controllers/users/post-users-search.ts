import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse } from '@utils/response';
import type { SearchUsersRequest } from '@api/api';

/**
 * POST /users/search
 * Search users via JSON body (admin).
 */
const postUsersSearch = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as SearchUsersRequest;
    const result = await UserService.search(body);
    successResponse(response, result);
};

export default postUsersSearch;
