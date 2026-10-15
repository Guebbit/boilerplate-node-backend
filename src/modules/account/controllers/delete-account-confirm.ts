/**
 * @module
 * `DELETE /account/delete-confirm` controller — spends the one-time deletion token and hard-deletes
 * the account.
 */

import type { Request, Response } from 'express';
import { ConfirmAccountDeleteBody } from '@api/schemas.zod';
import { accountService } from '../services';
import { destroySessionCookie, destroyLoggedCookie } from '../session/cookies';
import { successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { AccountDeleteConfirmRequest } from '@types';
import { parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * DELETE /account/delete-confirm
 * Validate the one-time deletion token and permanently remove the account.
 */
export const deleteAccountConfirm = (
    request: Request<unknown, unknown, AccountDeleteConfirmRequest>,
    response: Response
) => {
    const body = parseBody(ConfirmAccountDeleteBody, request.body, response);
    if (!body) return;

    return accountService
        .confirmAccountDeletion(body.token, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            destroySessionCookie(response);
            destroyLoggedCookie(response);
            successResponse<undefined>(response, undefined, result.status, result.message);
        })
        .catch((error: unknown) => {
            // Same interpreter every other write path answers through, so a recognised database
            // failure gets its own status rather than a flat 500.
            rejectDatabaseError(response, 'deleteAccountConfirm', error);
        });
};
