import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import type { DeleteUserRequest } from '@types';

/**
 * DELETE /users and DELETE /users/:id
 * Supports soft delete by default and hard delete when requested.
 */
export const deleteUsers = (
    request: Request<{ id?: string; hardDelete?: boolean }, unknown, DeleteUserRequest>,
    response: Response
) => {
    const id = request.params.id ?? request.body.id;
    const hardDelete = !!(request.params.hardDelete ?? request.body.hardDelete);

    if (!id) {
        rejectResponse(response, 422, 'deleteUser - missing id', [t('generic.error-missing-data')]);
        return Promise.resolve();
    }

    return userService
        .remove(id, hardDelete)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            successResponse(response, undefined, 200, result.message);
        })
        .catch((error: Error) => {
            if (error.message == '404')
                rejectResponse(response, 404, 'deleteUser - not found', [
                    t('ecommerce.user-not-found')
                ]);
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
};
