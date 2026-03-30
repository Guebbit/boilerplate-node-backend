import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { rejectResponse, successResponse } from '@utils/response';

/**
 * GET /users/:id
 * Get a single user by path id (admin).
 */
const getUserById = async (request: Request, response: Response): Promise<void> => {
    const user = await UserService.getById(String(request.params.id));
    if (!user) {
        rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
        return;
    }
    successResponse(response, user);
};

export default getUserById;
