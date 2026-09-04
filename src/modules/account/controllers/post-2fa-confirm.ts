/**
 * @module
 * `POST /account/2fa/methods/{method}/confirm` controller — thin HTTP adapter over
 * `accountService.confirmTwoFactorMethod`.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { ConfirmTwoFactorMethodBody, ConfirmTwoFactorMethodParams } from '@api/schemas.zod';
import type { TwoFactorConfirmRequest } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { rejectValidation } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { accountService } from '../services';
import { authTwoFactorEnrollTotal } from '../metrics';

/**
 * POST /account/2fa/methods/{method}/confirm — arms the pending method against a code the caller
 * has demonstrably received, and returns backup codes if this was the account's first factor.
 */
export const post2faConfirm = (
    request: Request<{ method: string }, unknown, TwoFactorConfirmRequest>,
    response: Response
) => {
    const { id } = authContextOf(request);

    const pathParameters = ConfirmTwoFactorMethodParams.safeParse(request.params);
    if (!pathParameters.success) return rejectValidation(response, pathParameters.error);

    const body = ConfirmTwoFactorMethodBody.safeParse(request.body);
    if (!body.success) {
        authTwoFactorEnrollTotal.inc({ method: pathParameters.data.method, status: 'failure' });
        return rejectValidation(response, body.error);
    }
    const { method } = pathParameters.data;

    return accountService
        .confirmTwoFactorMethod(id, method, body.data.code, callerContextOf(request))
        .then((result) => {
            if (!result.success) {
                authTwoFactorEnrollTotal.inc({ method, status: 'failure' });
                rejectResponse(response, result.status, result.errors);
                return;
            }
            authTwoFactorEnrollTotal.inc({ method, status: 'success' });
            successResponse(response, result.data, 200, t('account.two-factor.method-added'));
        })
        .catch((error: CastError | Error) =>
            rejectDatabaseError(response, 'post2faConfirm', error)
        );
};
