/**
 * @module
 * `GET /account/2fa` controller — thin HTTP adapter over `accountService.twoFactorStatus`.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { authContextOf } from '@infrastructure/http/request';
import { accountService } from '../services';

/**
 * GET /account/2fa — the caller's own second factors, and what they could still add. Only
 * `isAuth`: reading your own 2FA status reveals nothing a step-up would protect.
 */
export const get2fa = (request: Request, response: Response) => {
    const { id } = authContextOf(request);

    return accountService
        .twoFactorStatus(id)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            successResponse(response, result.data);
        })
        .catch((error: CastError | Error) => rejectDatabaseError(response, 'get2fa', error));
};
