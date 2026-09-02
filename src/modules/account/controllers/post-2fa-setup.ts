/**
 * @module
 * `POST /account/2fa/setup` controller — thin HTTP adapter over `accountService.setupTwoFactor`.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { accountService } from '../services';
import { authContextOf } from '@infrastructure/http/request';

/**
 * POST /account/2fa/setup — starts (or restarts) enrollment. Requires fresh critical auth (the
 * route guard): starting enrollment is itself a sensitive action.
 */
export const post2faSetup = (request: Request, response: Response) => {
    const { id } = authContextOf(request);

    return accountService
        .setupTwoFactor(id)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            successResponse(response, result.data, 200, 'Scan the QR code, then confirm a code.');
        })
        .catch((error: CastError | Error) => rejectDatabaseError(response, 'post2faSetup', error));
};
