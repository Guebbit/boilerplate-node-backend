/**
 * @module
 * `POST /account/reset-confirm` controller — spends the one-time reset token and sets the new
 * password.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { t } from '@infrastructure/i18n';
import { ConfirmPasswordResetBody } from '@api/schemas.zod';
import { accountService } from '../services';
import { destroyRefreshCookie, destroyLoggedCookie } from '../session/cookies';
import { successResponse } from '@infrastructure/http/response';
import type { PasswordResetConfirmRequest } from '@types';
import { parseBody, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { authPasswordResetConfirmTotal } from '../metrics';

/**
 * The contract's field list with the password rules dropped — same reason as
 * `postPasswordChange`: the generated `minLength` refuses first and reaches the caller as the
 * generic size sentence, shadowing the field's own copy from
 * `accountService.validatePasswordChange`, which `completePasswordReset` runs first.
 */
const resetConfirmShape = ConfirmPasswordResetBody.extend({
    password: z.string(),
    passwordConfirm: z.string()
});

/**
 * POST /account/reset-confirm
 * Validate a one-time reset token and set the new password.
 */
export const postResetConfirm = (
    // This token is provided in the url within the email that has been sent to the user
    request: Request<{ token?: string }, unknown, PasswordResetConfirmRequest>,
    response: Response
) => {
    const body = parseBody(resetConfirmShape, request.body, response);
    if (!body) return;

    const { token, password, passwordConfirm } = body;

    // The whole order — checks, then the atomic spend of the link — lives in the service, so a
    // refused password can never burn the link. See `completePasswordReset`.
    return accountService
        .completePasswordReset(token, password, passwordConfirm, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) {
                authPasswordResetConfirmTotal.inc({ status: 'failure' });
                return;
            }

            authPasswordResetConfirmTotal.inc({ status: 'success' });
            destroyRefreshCookie(response);
            destroyLoggedCookie(response);
            successResponse(response, undefined, 200, t('account.reset.success'));
        })
        .catch((error: unknown) => {
            authPasswordResetConfirmTotal.inc({ status: 'failure' });
            catchAs(response, 'postResetConfirm')(error);
        });
};
