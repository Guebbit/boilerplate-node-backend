/**
 * @module
 * `DELETE /account/2fa` controller — thin HTTP adapter over `accountService.disableTwoFactor`.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { DisableTwoFactorBody } from '@api/schemas.zod';
import type { TwoFactorDisableRequest } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { rejectValidation } from '@infrastructure/http/controller';
import { accountService } from '../services';
import { authTwoFactorDisableTotal } from '../metrics';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * DELETE /account/2fa — disables 2FA. Requires fresh critical auth (the route guard) AND a valid
 * code or backup code in the body: disabling from a stolen-but-fresh session is otherwise the
 * cheapest way around the whole feature.
 */
export const delete2fa = (
    request: Request<unknown, unknown, TwoFactorDisableRequest>,
    response: Response
) => {
    const { id } = authContextOf(request);

    const parseResult = DisableTwoFactorBody.safeParse(request.body);
    if (!parseResult.success) {
        authTwoFactorDisableTotal.inc({ status: 'failure' });
        return rejectValidation(response, parseResult.error);
    }

    return accountService
        .disableTwoFactor(id, parseResult.data.code, callerContextOf(request))
        .then((result) => {
            if (!result.success) {
                authTwoFactorDisableTotal.inc({ status: 'failure' });
                rejectResponse(response, result.status, result.errors);
                return;
            }
            authTwoFactorDisableTotal.inc({ status: 'success' });
            successResponse(response, undefined, 200, 'Two-factor authentication is now off.');
        })
        .catch((error: CastError | Error) => rejectDatabaseError(response, 'delete2fa', error));
};
