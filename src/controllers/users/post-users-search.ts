import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse } from '@utils/response';
import type { SearchUsersRequest } from '@types';

/**
 * POST /users/search
 * Search users via JSON body (admin).
 */
const postUsersSearch = (
    request: Request<unknown, unknown, SearchUsersRequest>,
    response: Response
): Promise<void> =>
    UserService.search(request.body).then((result) => {
        successResponse(response, result);
    });

export default postUsersSearch;
