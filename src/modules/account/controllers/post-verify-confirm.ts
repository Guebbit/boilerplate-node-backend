/**
 * @module
 * `POST /account/verify-confirm` controller — spends a one-time verification token and marks the
 * account's email verified.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { ConfirmEmailVerificationBody } from '@api/schemas.zod';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { VerifyEmailConfirmRequest } from '@types';
import { authEmailVerifyTotal } from '../metrics';
import { accountService, EMAIL_VERIFY_TOKEN_TYPE } from '../services';
import { rejectValidation } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/verify-confirm — spends a one-time verification token, marks the email verified.
 * Public deliberately (like `reset-confirm`/`delete-confirm`): the token in the body is the
 * credential, not a login. Find then spend for the race — the find is a read two simultaneous
 * clicks both pass; only the atomic spend picks a winner, and the loser gets the same "token not
 * found" an invented token would. See `services/tokens.ts`, which owns both halves.
 */
export const postVerifyConfirm = (
    request: Request<unknown, unknown, VerifyEmailConfirmRequest>,
    response: Response
) => {
    const parseResult = ConfirmEmailVerificationBody.safeParse(request.body);
    if (!parseResult.success) {
        authEmailVerifyTotal.inc({ status: 'failure' });
        return rejectValidation(response, parseResult.error);
    }

    const { token } = parseResult.data;

    /** Every refusal answers identically — see the note in `services/tokens.ts`. */
    const refuse = () => {
        authEmailVerifyTotal.inc({ status: 'failure' });
        rejectResponse(response, 422, [t('account.verify.token-not-found')]);
    };

    return accountService
        .findLiveToken(EMAIL_VERIFY_TOKEN_TYPE, token)
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
                    .completeEmailVerification(user, callerContextOf(request))
                    .then(() => {
                        authEmailVerifyTotal.inc({ status: 'success' });
                        successResponse(response, undefined, 200, t('account.verify.success'));
                    });
            });
        })
        .catch(() => {
            authEmailVerifyTotal.inc({ status: 'failure' });
            rejectResponse(response, 500, []);
        });
};
