/**
 * @module
 * `DELETE /account/2fa/methods/{method}` controller — thin HTTP adapter over
 * `accountService.removeTwoFactorMethod`.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { RemoveTwoFactorMethodBody, RemoveTwoFactorMethodParams } from '@api/schemas.zod';
import type { TwoFactorCodeRequest } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { rejectValidation } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { accountService } from '../services';
import { authTwoFactorDisableTotal } from '../metrics';

/**
 * DELETE /account/2fa/methods/{method} — drops one factor and leaves the rest armed. Fresh
 * critical auth AND a valid code, same reasoning as the full disable: a stolen-but-fresh session
 * must not be able to peel factors off one at a time either.
 */
export const delete2faMethod = (
    request: Request<{ method: string }, unknown, TwoFactorCodeRequest>,
    response: Response
) => {
    const { id } = authContextOf(request);

    const pathParameters = RemoveTwoFactorMethodParams.safeParse(request.params);
    if (!pathParameters.success) return rejectValidation(response, pathParameters.error);

    const body = RemoveTwoFactorMethodBody.safeParse(request.body);
    if (!body.success) {
        authTwoFactorDisableTotal.inc({ method: pathParameters.data.method, status: 'failure' });
        return rejectValidation(response, body.error);
    }
    const { method } = pathParameters.data;

    return accountService
        .removeTwoFactorMethod(id, method, body.data.code, callerContextOf(request))
        .then((result) => {
            if (!result.success) {
                authTwoFactorDisableTotal.inc({ method, status: 'failure' });
                rejectResponse(response, result.status, result.errors);
                return;
            }
            authTwoFactorDisableTotal.inc({ method, status: 'success' });
            successResponse<undefined>(
                response,
                undefined,
                200,
                t('account.two-factor.method-removed')
            );
        })
        .catch((error: CastError | Error) =>
            rejectDatabaseError(response, 'delete2faMethod', error)
        );
};
