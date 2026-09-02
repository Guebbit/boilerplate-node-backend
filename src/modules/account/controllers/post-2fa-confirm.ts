/**
 * @module
 * `POST /account/2fa/confirm` controller — thin HTTP adapter over `accountService.confirmTwoFactor`.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { ConfirmTwoFactorBody } from '@api/schemas.zod';
import type { TwoFactorConfirmRequest } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { rejectValidation } from '@infrastructure/http/controller';
import { accountService } from '../services';
import { authTwoFactorEnrollTotal } from '../metrics';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/2fa/confirm — arms the pending secret against a code the caller has demonstrably
 * read off their own device, and returns backup codes shown exactly once.
 */
export const post2faConfirm = (
    request: Request<unknown, unknown, TwoFactorConfirmRequest>,
    response: Response
) => {
    const { id } = authContextOf(request);

    const parseResult = ConfirmTwoFactorBody.safeParse(request.body);
    if (!parseResult.success) {
        authTwoFactorEnrollTotal.inc({ status: 'failure' });
        return rejectValidation(response, parseResult.error);
    }

    return accountService
        .confirmTwoFactor(id, parseResult.data.code, callerContextOf(request))
        .then((result) => {
            if (!result.success) {
                authTwoFactorEnrollTotal.inc({ status: 'failure' });
                rejectResponse(response, result.status, result.errors);
                return;
            }
            authTwoFactorEnrollTotal.inc({ status: 'success' });
            successResponse(response, result.data, 200, 'Two-factor authentication is now on.');
        })
        .catch((error: CastError | Error) =>
            rejectDatabaseError(response, 'post2faConfirm', error)
        );
};
