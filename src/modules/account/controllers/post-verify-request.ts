/**
 * @module
 * `POST /account/verify-request` controller — thin HTTP adapter over
 * `accountService.requestEmailVerificationFor`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { accountService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/verify-request
 * Re-send the email-verification link to the authenticated user.
 *
 * Signup already sends one; this exists for the mail that never arrived. Which states cannot be
 * verified — no such account, or one already verified — is the service's to decide, so that a
 * second caller cannot reach the send without them; see `services/verification.ts`.
 */
export const postVerifyRequest = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = authContextOf(request);

    return accountService
        .requestEmailVerificationFor(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, undefined, result.status, result.message);
        })
        .catch(catchAs(response, 'postVerifyRequest'));
};
