import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';

export const getUserItem = (request: Request, response: Response) =>
    userService
        .getById(String(request.params.id))
        .then((user) => {
            if (!user) {
                rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
                return;
            }
            successResponse(response, user);
        })
        .catch((error: Error) => {
            if (error.message == '404')
                rejectResponse(response, 404, 'deleteUser - not found', [
                    t('ecommerce.user-not-found')
                ]);
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
