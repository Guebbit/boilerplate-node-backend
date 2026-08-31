/**
 * @module
 * `POST /account/reset-confirm` controller — spends the one-time reset token and sets the new
 * password.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { ConfirmPasswordResetBody } from '@api/schemas.zod';
import { accountService, PASSWORD_RESET_TOKEN_TYPE } from '../services';
import { destroyRefreshCookie, destroyLoggedCookie } from '../session/cookies';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { PasswordResetConfirmRequest } from '@types';
import { parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/reset-confirm
 * Validate a one-time reset token and set the new password.
 */
export const postResetConfirm = (
    // This token is provided in the url within the email that has been sent to the user
    request: Request<{ token?: string }, unknown, PasswordResetConfirmRequest>,
    response: Response
) => {
    const body = parseBody(ConfirmPasswordResetBody, request.body, response);
    if (!body) return;

    const { token, password, passwordConfirm } = body;

    /** Every refusal answers identically — see the note in `services/tokens.ts`. */
    const refuseToken = () => {
        rejectResponse(response, 422, [t('account.reset.token-not-found')]);
    };

    return accountService
        .findLiveToken(PASSWORD_RESET_TOKEN_TYPE, token)
        .then((user) => {
            if (!user) {
                refuseToken();
                return;
            }

            /*
             * Validate BEFORE spending the token, then let spending it decide the race.
             *
             * The find above is a read, so two simultaneous confirms of one reset link both pass
             * it — a one-time token used twice. Only the atomic `$pull` inside `spendLiveToken`
             * can separate them: it reports whether THIS request removed the entry, and the loser
             * is turned away with the same "token not found" an invented token gets.
             *
             * Validation comes first so a mistyped confirmation cannot burn the link — which is
             * why finding and spending are two calls rather than one; see `services/tokens.ts`.
             * Password writing comes last, so the request that loses the race changes nothing.
             */
            const errors = accountService.validatePasswordChange(password, passwordConfirm);
            if (errors.length > 0) {
                rejectResponse(response, 422, errors);
                return;
            }

            return accountService.spendLiveToken(user, token).then((spentByThisRequest) => {
                if (!spentByThisRequest) {
                    refuseToken();
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
            });
        })
        .catch(() => {
            rejectResponse(response, 500, []);
        });
};
