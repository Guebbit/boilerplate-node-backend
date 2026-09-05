/**
 * @module
 * `POST /account/login/2fa/send` controller — thin HTTP adapter over
 * `accountService.sendLoginCode`.
 */

import type { Request, Response } from 'express';
import { SendTwoFactorCodeBody } from '@api/schemas.zod';
import type { TwoFactorSendRequest, TwoFactorDelivery } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { rejectValidation } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { accountService } from '../services';
import { authTwoFactorCodeSentTotal } from '../metrics';

/**
 * POST /account/login/2fa/send — mails (or texts) a fresh code against a live challenge. Public,
 * like the rest of the login flow: the challenge token is the credential.
 */
export const postLoginTwoFactorSend = (
    request: Request<Record<string, string>, unknown, TwoFactorSendRequest>,
    response: Response
) => {
    const parseResult = SendTwoFactorCodeBody.safeParse(request.body);
    if (!parseResult.success) {
        authTwoFactorCodeSentTotal.inc({ method: 'unknown', status: 'failure' });
        return rejectValidation(response, parseResult.error);
    }
    const { challenge, method } = parseResult.data;

    return accountService
        .sendLoginCode(challenge, method, callerContextOf(request))
        .then((result) => {
            if (!result.success) {
                authTwoFactorCodeSentTotal.inc({ method, status: 'failure' });
                rejectResponse(response, result.status, result.errors);
                return;
            }
            const { data } = result;
            if (data === undefined) {
                // A success verdict without a payload is a broken service contract, not a bad request.
                authTwoFactorCodeSentTotal.inc({ method, status: 'failure' });
                rejectResponse(response, 500, []);
                return;
            }
            authTwoFactorCodeSentTotal.inc({ method, status: 'success' });
            successResponse<TwoFactorDelivery>(
                response,
                data,
                200,
                t('account.two-factor.code-sent')
            );
        })
        .catch((error: Error) => {
            authTwoFactorCodeSentTotal.inc({ method, status: 'failure' });
            rejectDatabaseError(response, 'postLoginTwoFactorSend', error);
        });
};
