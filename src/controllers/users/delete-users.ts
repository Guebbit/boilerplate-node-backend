import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from 'i18next';
import type { CastError } from 'mongoose';
import { userService } from '@services/users';
import { rejectResponse, successResponse } from '@utils/response';
import { extractAndValidateId, extractHardDelete } from '@utils/helpers-request';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';

/**
 * DELETE /users — delete a user by id in the request body (admin).
 * DELETE /users/:id — delete a user by path id (admin).
 *
 * Pass ?hardDelete=true (query) or { hardDelete: true } (body) to permanently
 * delete; otherwise the user is soft-deleted (sets deletedAt).
 */
export const deleteUsers = (request: Request<ParamsDictionary>, response: Response) => {
    const id = extractAndValidateId(request, response, 'deleteUser');
    if (!id) return Promise.resolve();

    const hardDelete = extractHardDelete(request);

    return userService
        // true = hard-delete; false (default) = soft-delete (sets deletedAt)
        .removeById(id, hardDelete)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            emitAuditEvent(buildAuditEvent(request, {
                action: AuditAction.ADMIN_USER_DELETED,
                outcome: 'success',
                target_type: 'user',
                target_id: id,
                metadata: { hardDelete }
            }));
            successResponse(response, undefined, 200, result.message);
        })
        .catch((error: CastError) => {
            if (error.message === '404' || error.kind === 'ObjectId')
                return rejectResponse(response, 404, 'Not Found', [
                    t('ecommerce.user-not-found')
                ]);
            rejectResponse(response, 500, 'Internal Server Error', [error.message]);
        });
};
