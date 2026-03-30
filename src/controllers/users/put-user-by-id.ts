import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateUserByIdRequest } from '@api/api';

/**
 * PUT /users/:id
 * Update a user by path id (admin).
 */
const putUserById = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateUserByIdRequest;
    try {
        const user = await UserService.adminUpdate(String(request.params.id), body);
        successResponse(response, user.toObject());
    } catch (error) {
        const message = (error as Error).message;
        if (message === '404')
            rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
        else
            rejectResponse(response, 500, 'Internal Server Error', [message]);
    }
};

export default putUserById;
