import type { Request, Response } from 'express';
import { userService } from '@services/users';
import { successResponse } from '@utils/response';
import type { SearchUsersRequest } from '@types';

/**
 * POST /users/search
 * Search users via JSON body (admin).
 */
export const postUsersSearch = (
    request: Request<unknown, unknown, SearchUsersRequest>,
    response: Response
) =>
    userService.search(request.body).then((result) => {
        successResponse(response, result);
    });
