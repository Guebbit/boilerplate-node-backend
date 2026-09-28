/**
 * @module
 * `POST /account/reset-request` controller — thin HTTP adapter over
 * `accountService.requestPasswordReset`, answering identically whether or not the email exists.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { RequestPasswordResetBody } from '@api/schemas.zod';
import { accountService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import type { PasswordResetRequest } from '@types';
import { authPasswordResetTotal } from '../metrics';
import { catchAs, parseBody } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/reset-request
 * Indistinguishable response for valid and invalid emails — prevents user enumeration.
 * `accountService.requestPasswordReset` owns the unconditional `AUTH_PASSWORD_RESET_REQUESTED`
 * emit and the fail-closed handling behind it; the mail send lives there too, so the token value
 * never reaches this file.
 *
 * @param request - Express request with PasswordResetRequest body
 * @param response - Express response
 */
export const postResetRequest = (
    request: Request<unknown, unknown, PasswordResetRequest>,
    response: Response
) => {
    // Shape validation only — existence of the account is never revealed (see above).
    const body = parseBody(RequestPasswordResetBody, request.body, response);
    if (!body) return;

    return accountService
        .requestPasswordReset(body.email, callerContextOf(request))
        .then((sent) => {
            authPasswordResetTotal.inc({ status: sent ? 'success' : 'failure' });
            successResponse(response, undefined, 200, t('account.reset.email-sent'));
        })
        .catch(catchAs(response, 'postResetRequest'));
};
