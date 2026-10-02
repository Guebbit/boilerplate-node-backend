/**
 * @module
 * `POST /account/pending-email/resend` controller — thin HTTP adapter over
 * `accountService.resendPendingEmailVerificationFor`.
 */

import type { Request, Response } from 'express';
import { accountService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/pending-email/resend — mails the pending address a fresh link. Answers 204 with no
 * body, also when nothing was pending: the call has nothing to report beyond "done".
 */
export const postPendingEmailResend = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    return accountService
        .resendPendingEmailVerificationFor(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            // Express: 204 carries no body, so no envelope is written.
            response.status(204).end();
        })
        .catch(catchAs(response, 'postPendingEmailResend'));
};
