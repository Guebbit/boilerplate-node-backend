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
 * POST /account/verify-request — re-sends the verification link (signup already sent one; this
 * covers mail that never arrived). Which states can't be verified is the service's call, so a
 * second caller can't bypass it; see `services/verification.ts`.
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
