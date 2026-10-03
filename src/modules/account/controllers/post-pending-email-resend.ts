/**
 * @module
 * `POST /account/pending-email/resend` controller — thin HTTP adapter over
 * `accountService.resendPendingEmailVerificationFor`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { accountService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/pending-email/resend — mails the pending address a fresh link and answers the
 * seconds to count down before the next one, as `POST /account/verify-request` does. Nothing
 * pending is not an error: it answers `resendAfter` 0.
 */
export const postPendingEmailResend = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    return accountService
        .resendPendingEmailVerificationFor(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data, result.status, result.message);
        })
        .catch(catchAs(response, 'postPendingEmailResend'));
};
