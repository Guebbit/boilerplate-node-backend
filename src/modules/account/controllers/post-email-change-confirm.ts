/**
 * @module
 * `POST /account/email-change-confirm` controller — spends a one-time `email-change` token and
 * swaps the caller's `pendingEmail` into `email`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { ConfirmEmailChangeBody } from '@api/schemas.zod';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
// The request body schema is shared with `verify-confirm` — both endpoints accept `{ token }` —
// so orval names the TYPE after that shared schema rather than minting a second one.
import type { VerifyEmailConfirmRequest } from '@types';
import { authEmailChangeConfirmTotal } from '../metrics';
import { accountService, EMAIL_CHANGE_TOKEN_TYPE } from '../services';
import { rejectValidation } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/email-change-confirm — spends a one-time `email-change` token, swaps
 * `pendingEmail` into `email`. Public deliberately, like `verify-confirm`: the token in the body
 * is the credential, not a login. Find then spend for the race — same reasoning as
 * `postVerifyConfirm`, see `services/tokens.ts`. A `'verify'` token is refused here — its
 * `EMAIL_VERIFY_TOKEN_TYPE` never matches `findLiveToken`'s `EMAIL_CHANGE_TOKEN_TYPE` filter — the
 * two prove different addresses and must not do each other's work.
 */
export const postEmailChangeConfirm = (
    request: Request<unknown, unknown, VerifyEmailConfirmRequest>,
    response: Response
) => {
    const parseResult = ConfirmEmailChangeBody.safeParse(request.body);
    if (!parseResult.success) {
        authEmailChangeConfirmTotal.inc({ status: 'failure' });
        return rejectValidation(response, parseResult.error);
    }

    const { token } = parseResult.data;

    /** Every refusal answers identically — see the note in `services/tokens.ts`. */
    const refuse = () => {
        authEmailChangeConfirmTotal.inc({ status: 'failure' });
        rejectResponse(response, 422, [t('account.email-change.token-not-found')]);
    };

    return accountService
        .findLiveToken(EMAIL_CHANGE_TOKEN_TYPE, token)
        .then((user) => {
            if (!user) {
                refuse();
                return;
            }

            return accountService.spendLiveToken(user, token).then((spentByThisRequest) => {
                if (!spentByThisRequest) {
                    refuse();
                    return;
                }

                return accountService
                    .completeEmailChange(user, callerContextOf(request))
                    .then(() => {
                        authEmailChangeConfirmTotal.inc({ status: 'success' });
                        successResponse(
                            response,
                            undefined,
                            200,
                            t('account.email-change.success')
                        );
                    });
            });
        })
        .catch(() => {
            authEmailChangeConfirmTotal.inc({ status: 'failure' });
            rejectResponse(response, 500, []);
        });
};
