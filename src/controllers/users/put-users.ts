import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateUserRequest } from '../../../api/api';

/**
 * PUT /users
 * Update a user by id in the request body (admin).
 */
const putUsers = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateUserRequest;
    if (!body.id) {
        rejectResponse(response, 422, 'updateUser - missing id', [t('generic.error-missing-data')]);
        return;
    }
    try {
        const user = await UserService.adminUpdate(body.id, body);
        successResponse(response, user.toObject());
    } catch (error) {
        const message = (error as Error).message;
        if (message === '404')
            rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
        else
            rejectResponse(response, 500, 'Internal Server Error', [message]);
    }
};

export default putUsers;
