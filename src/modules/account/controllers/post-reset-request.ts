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
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { authPasswordResetTotal } from '../metrics';
import { parseBody } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/*
 * Audit emit stays at the controller: it fires UNCONDITIONALLY regardless of whether the email
 * belongs to a real account, keeping the response identical either way and preventing user
 * enumeration. A service function reachable only once a user is found couldn't reproduce that.
 * The mail moved the other way — `requestPasswordReset` mints the token, publishes the job, and
 * reports back only a boolean; the token value never reaches this file.
 */

/**
 * POST /account/reset-request
 * Indistinguishable response for valid and invalid emails — prevents user enumeration.
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

    const context = callerContextOf(request);

    return (
        accountService
            .requestPasswordReset(body.email, context)
            // Fail closed and keep the public response identical to protect account privacy.
            .catch(() => false)
            .then((sent) => {
                authPasswordResetTotal.inc({ status: sent ? 'success' : 'failure' });

                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED,
                        actor_user_id: 'anonymous',
                        actor_role: 'anonymous',
                        outcome: 'success'
                    })
                );

                successResponse(response, undefined, 200, t('account.reset.email-sent'));
            })
    );
};
