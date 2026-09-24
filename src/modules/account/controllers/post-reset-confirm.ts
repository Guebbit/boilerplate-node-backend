/**
 * @module
 * `POST /account/reset-confirm` controller — spends the one-time reset token and sets the new
 * password.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { t } from '@infrastructure/i18n';
import { ConfirmPasswordResetBody } from '@api/schemas.zod';
import { accountService, PASSWORD_RESET_TOKEN_TYPE } from '../services';
import { destroyRefreshCookie, destroyLoggedCookie } from '../session/cookies';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { PasswordResetConfirmRequest } from '@types';
import { parseBody, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * The contract's field list with the password rules dropped — same reason as
 * `postPasswordChange`: the generated `minLength` refuses first and reaches the caller as the
 * generic size sentence, shadowing the field's own copy from
 * `accountService.validatePasswordChange`, which runs once the token is known to be live.
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

    /*
     * Validate the new password BEFORE even looking up the token, so a mistyped password can't
     * burn the link — this check is pure (no user, no database) and needs neither. The token
     * itself is still spent atomically inside `redeemLiveToken`: two simultaneous confirms of one
     * link both find it live, and only the winning `$pull` decides which one actually spent it —
     * the loser gets the same "token not found" an invented token would.
     */
    const errors = accountService.validatePasswordChange(password, passwordConfirm);
    if (errors.length > 0) {
        rejectResponse(response, 422, errors);
        return;
    }

    return accountService
        .redeemLiveToken(PASSWORD_RESET_TOKEN_TYPE, token)
        .then((user) => {
            if (!user) {
                rejectResponse(response, 422, [t('account.reset.token-not-found')]);
                return;
            }

            /**
             * Change password. The confirmation mail is published by the service, which is
             * where a fact about the account belongs — see `services/profile.ts`.
             */
            return accountService
                .passwordResetChange(user, password, passwordConfirm, callerContextOf(request))
                .then((result) => {
                    if (refused(response, result)) return;

                    destroyRefreshCookie(response);
                    destroyLoggedCookie(response);
                    successResponse(response, undefined, 200, t('account.reset.success'));
                });
        })
        .catch(catchAs(response, 'postResetConfirm'));
};
