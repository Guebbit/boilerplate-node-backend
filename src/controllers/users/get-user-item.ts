import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * GET /users/:id
 * Get a single user by path id (admin).
 */
export const getUserItem = (request: Request, response: Response) => {
    return userService.getById(String(request.params.id)).then((user) => {
        if (!user) {
            rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
            return;
        }
        successResponse(response, user);
    });
};
