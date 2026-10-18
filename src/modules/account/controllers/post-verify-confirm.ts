/**
 * @module
 * `POST /account/verify-confirm` controller — spends a one-time verification token and marks the
 * account's email verified.
 */

import type { Request, Response } from 'express';
import { ConfirmEmailVerificationBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import type { VerifyEmailConfirmRequest } from '@types';
import { authEmailVerifyTotal } from '../metrics';
import { accountService } from '../services';
import { parseBody, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/verify-confirm — spends a one-time verification token, marks the email verified.
 * Public deliberately (like `reset-confirm`/`delete-confirm`): the token in the body is the
 * credential, not a login. `accountService.confirmEmailVerification` owns the find-then-spend.
 */
export const postVerifyConfirm = (
    request: Request<unknown, unknown, VerifyEmailConfirmRequest>,
    response: Response
) => {
    const parsed = parseBody(ConfirmEmailVerificationBody, request.body, response);
    if (!parsed) {
        authEmailVerifyTotal.inc({ status: 'failure' });
        return;
    }

    return accountService
        .confirmEmailVerification(parsed.token, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) {
                authEmailVerifyTotal.inc({ status: 'failure' });
                return;
            }
            authEmailVerifyTotal.inc({ status: 'success' });
            successResponse(response, undefined, result.status, result.message);
        })
        .catch((error: unknown) => {
            authEmailVerifyTotal.inc({ status: 'failure' });
            catchAs(response, 'postVerifyConfirm')(error);
        });
};
