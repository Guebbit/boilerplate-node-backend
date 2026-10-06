/**
 * @module
 * `POST /account/reset-request` controller — thin HTTP adapter over
 * `accountService.requestPasswordReset`, answering identically, and at once, whether or not the
 * email exists.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { RequestPasswordResetBody } from '@api/schemas.zod';
import { accountService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import type { PasswordResetRequest } from '@types';
import { parseBody } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/reset-request
 * Indistinguishable response for valid and invalid emails — prevents user enumeration.
 * `accountService.requestPasswordReset` owns the unconditional `AUTH_PASSWORD_RESET_REQUESTED`
 * emit, the metric and the fail-closed handling behind it, all detached from the response; the
 * mail send lives there too, so the token value never reaches this file.
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

    // Detached: the answer must not wait on a lookup, a token write and a mail enqueue that only
    // exist for a registered address, or the response time itself says which addresses those are
    // (OWASP Forgot Password Cheat Sheet, "consistent response time"). The service logs its own
    // failures and keeps the metric and the audit row.
    void accountService.requestPasswordReset(body.email, callerContextOf(request));
    successResponse(response, undefined, 200, t('account.reset.email-sent'));
};
