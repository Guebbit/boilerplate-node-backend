import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import type { DeleteUserRequest } from '@types';

/**
 * DELETE /users
 * Delete a user by id in the request body (admin).
 */
const deleteUsers = (
    request: Request<unknown, unknown, DeleteUserRequest>,
    response: Response
) => {
    if (!request.body.id) {
        rejectResponse(response, 422, 'deleteUser - missing id', [t('generic.error-missing-data')]);
        return Promise.resolve();
    }
    return UserService.remove(request.body.id, request.body.hardDelete ?? false).then((result) => {
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, undefined, 200, result.message);
    });
};

export default deleteUsers;
