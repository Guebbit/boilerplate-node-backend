import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * GET /users/:id
 * Get a single user by path id (admin).
 */
const getUserById = (request: Request, response: Response): Promise<void> => {
    return UserService.getById(String(request.params.id)).then((user) => {
        if (!user) {
            rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
            return;
        }
        successResponse(response, user);
    });
};

export default getUserById;
