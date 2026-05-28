import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from 'i18next';
import type { CastError } from 'mongoose';
import { userService } from '@services/users';
import { rejectResponse, successResponse } from '@utils/response';
import { extractAndValidateId } from '@utils/helpers-request';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

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

    const hardDelete = !!(
        request.query.hardDelete ??
        request.params.hardDelete ??
        (request.body as { hardDelete?: boolean }).hardDelete
    );

    return userService
        // true = hard-delete; false (default) = soft-delete (sets deletedAt)
        .remove(id, hardDelete)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            emitAuditEvent({
                action: AuditAction.ADMIN_USER_DELETED,
                actor_user_id: request.authContext?.id ?? 'unknown',
                actor_role: 'admin',
                outcome: 'success',
                target_type: 'user',
                target_id: id,
                ...extractRequestContext(request),
                metadata: { hardDelete }
            });
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
