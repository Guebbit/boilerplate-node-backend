/**
 * @module
 * `POST /account/2fa/methods/{method}/setup` controller — thin HTTP adapter over
 * `twoFactorService.setupTwoFactorMethod`.
 */

import type { Request, Response } from 'express';
import { SetupTwoFactorMethodBody, SetupTwoFactorMethodParams } from '@api/schemas.zod';
import type { TwoFactorSetup } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectValidation, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { twoFactorService } from '../services';

/**
 * POST /account/2fa/methods/{method}/setup — starts (or restarts) enrollment of one method.
 * Requires fresh critical auth (the route guard), and — once any factor is armed — a code from one
 * of them: a restart disarms a factor that was already working, which is exactly what an attacker
 * holding a stolen session would reach for.
 */
export const post2faSetup = (request: Request<{ method: string }>, response: Response) => {
    const { id } = request.authContext!;

    const parseResult = SetupTwoFactorMethodParams.safeParse(request.params);
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    // The body is optional: the account's first factor sends none.
    const body = SetupTwoFactorMethodBody.safeParse(request.body ?? {});
    if (!body.success) return rejectValidation(response, body.error);

    return twoFactorService
        .setupTwoFactorMethod(id, parseResult.data.method, body.data.code, callerContextOf(request))
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            successResponse<TwoFactorSetup>(response, result.data);
        })
        .catch(catchAs(response, 'post2faSetup'));
};
