import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from '@infrastructure/i18n';
import type { CastError } from 'mongoose';
import { userService } from '../service';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { extractAndValidateId, readInput } from '@infrastructure/http/request';
import { hardDeleteSchema } from '@infrastructure/http/schemas';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { usersAuditActions } from '../audit';

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

    // `hardDelete` is a boolean the route accepts three ways — see docs/theory/request-input.md.
    // The path form (`DELETE /users/:id/hard`) reaches `params` through `routeFlag`.
    const input = readInput(request, {
        surface: 'delete',
        booleans: ['hardDelete']
    });
    const parseResult = hardDeleteSchema.safeParse(input.hardDelete);
    if (!parseResult.success)
        return Promise.resolve(
            rejectResponse(
                response,
                422,
                parseResult.error.issues.map(({ message }) => message)
            )
        );
    const hardDelete = parseResult.data;

    return (
        userService
            // true = hard-delete; false (default) = soft-delete (sets deletedAt)
            .removeById(id, hardDelete)
            .then((result) => {
                if (!result.success) {
                    rejectResponse(response, result.status, result.errors);
                    return;
                }
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: usersAuditActions.ADMIN_USER_DELETED,
                        outcome: 'success',
                        target_type: 'user',
                        target_id: id,
                        metadata: { hardDelete }
                    })
                );
                successResponse(response, undefined, 200, result.message);
            })
            .catch((error: CastError) => {
                if (error.kind === 'ObjectId')
                    return rejectResponse(response, 404, [t('users.not-found')]);
                rejectDatabaseError(response, 'deleteUser', error);
            })
    );
};
