/**
 * @module
 * `POST /account/2fa/methods/{method}/setup` controller — thin HTTP adapter over
 * `accountService.setupTwoFactorMethod`.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { SetupTwoFactorMethodParams } from '@api/schemas.zod';
import type { TwoFactorSetup } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { rejectValidation } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';
import { accountService } from '../services';

/**
 * POST /account/2fa/methods/{method}/setup — starts (or restarts) enrollment of one method.
 * Requires fresh critical auth (the route guard): a restart disarms a factor that was already
 * working, which is exactly what an attacker holding a stolen session would reach for.
 */
export const post2faSetup = (request: Request<{ method: string }>, response: Response) => {
    const { id } = authContextOf(request);

    const parseResult = SetupTwoFactorMethodParams.safeParse(request.params);
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return accountService
        .setupTwoFactorMethod(id, parseResult.data.method, callerContextOf(request))
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            const { data } = result;
            if (data === undefined) {
                // A success verdict without a payload is a broken service contract, not a bad request.
                rejectResponse(response, 500, []);
                return;
            }
            successResponse<TwoFactorSetup>(response, data);
        })
        .catch((error: CastError | Error) => rejectDatabaseError(response, 'post2faSetup', error));
};
