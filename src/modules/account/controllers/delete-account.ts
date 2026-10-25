/**
 * @module
 * `DELETE /account` controller — the authenticated user locks their own account and schedules its
 * erasure. Answers 202 with the two dates and clears the session cookie: the account's sessions
 * died in the same write.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { userService } from '@modules/users';
import { accountService } from '../services';
import { destroySessionCookie } from '../session/cookies';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { authAccountDeleteTotal } from '../metrics';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';

/**
 * DELETE /account
 * @param request - authenticated request (isAuth, a critically fresh session and, with 2FA, an otp proof required)
 * @param response - Express response
 */
export const deleteAccount = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    return userService
        .findAuthenticatableById(id)
        .then((user) => {
            if (!user) {
                authAccountDeleteTotal.inc({ status: 'failure' });
                // A valid token whose row is gone or locked is a dead session, not a server fault.
                rejectResponse(response, 401);
                return;
            }
            return accountService
                .scheduleAccountDeletion(user, callerContextOf(request))
                .then((schedule) => {
                    destroySessionCookie(response);
                    successResponse(
                        response,
                        {
                            requestedAt: schedule.requestedAt.toISOString(),
                            purgeAt: schedule.purgeAt.toISOString()
                        },
                        202,
                        t('account.delete.scheduled')
                    );
                });
        })
        .catch(catchAs(response, 'deleteAccount'));
};
