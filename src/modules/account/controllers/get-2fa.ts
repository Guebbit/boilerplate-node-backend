/**
 * @module
 * `GET /account/2fa` controller — thin HTTP adapter over `twoFactorService.twoFactorStatus`.
 */

import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { TwoFactorStatus } from '@types';
import { rejectDatabaseError } from '@infrastructure/http/errors';

import { twoFactorService } from '../services';

/**
 * GET /account/2fa — the caller's own second factors, and what they could still add. Only
 * `isAuth`: reading your own 2FA status reveals nothing a step-up would protect.
 */
export const get2fa = (request: Request, response: Response) => {
    const { id } = request.authContext!;

    return twoFactorService
        .twoFactorStatus(id)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }

            successResponse<TwoFactorStatus>(response, result.data);
        })
        .catch((error: unknown) => rejectDatabaseError(response, 'get2fa', error));
};
