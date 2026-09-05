/**
 * @module
 * `DELETE /users/:id/2fa` controller — admin-assisted 2FA recovery, thin adapter over
 * `userService.adminDisableTwoFactor`.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { callerContextOf } from '@infrastructure/http/request';
import { userService } from '../service';

/**
 * DELETE /users/:id/2fa — strips a user's second factor with no code required, unlike the
 * self-service path (`DELETE /account/2fa`) and the login challenge. Admin-only by the router's
 * own gate; every outcome is audited by the service, since this is the one deliberate bypass of
 * "prove the factor to remove it".
 */
export const deleteUserTwoFactor = (request: Request<{ id: string }>, response: Response) => {
    const { id } = request.params;

    return userService
        .adminDisableTwoFactor(id, callerContextOf(request))
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            successResponse(response, undefined, 200, t('users.two-factor-disabled'));
        })
        .catch((error: CastError | Error) =>
            rejectDatabaseError(response, 'deleteUserTwoFactor', error)
        );
};
