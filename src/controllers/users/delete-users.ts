import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import type { DeleteUserRequest } from '@types';
import type { CastError } from 'mongoose';

/**
 * DELETE /users — delete a user by id in the request body (admin).
 * DELETE /users/:id — delete a user by path id (admin).
 *
 * Pass ?hardDelete=true (query) or { hardDelete: true } (body) to permanently
 * delete; otherwise the user is soft-deleted (sets deletedAt).
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

    // Accept ?hardDelete=true query param (both routes) or body.hardDelete boolean (DELETE / only)
    return userService
        .remove(id, hardDelete)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            successResponse(response, undefined, 200, result.message);
        })
        .catch((error: CastError) => {
            if (error.message == '404' || error.kind === 'ObjectId')
                rejectResponse(response, 404, 'deleteUser - not found', [
                    t('ecommerce.user-not-found')
                ]);
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
};
