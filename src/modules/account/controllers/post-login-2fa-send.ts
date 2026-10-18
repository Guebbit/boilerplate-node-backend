/**
 * @module
 * `POST /account/login/2fa/send` controller — thin HTTP adapter over
 * `twoFactorService.sendLoginCode`.
 */

import type { Request, Response } from 'express';
import { SendTwoFactorCodeBody } from '@api/schemas.zod';
import type { TwoFactorSendRequest, TwoFactorDelivery } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { twoFactorService } from '../services';
import { authTwoFactorCodeSentTotal } from '../metrics';
import { readMfaChallengeCookie } from '../oauth/mfa-redirect';

/**
 * POST /account/login/2fa/send — mails (or texts) a fresh code against a live challenge. Public,
 * like the rest of the login flow: the challenge token is the credential.
 */
export const postLoginTwoFactorSend = (
    request: Request<Record<string, string>, unknown, TwoFactorSendRequest>,
    response: Response
) => {
    const parsed = parseBody(SendTwoFactorCodeBody, request.body, response);
    if (!parsed) {
        authTwoFactorCodeSentTotal.inc({ method: 'unknown', status: 'failure' });
        return;
    }
    const { method } = parsed;
    // Same fallback `postLoginTwoFactor` makes — see `oauth/mfa-redirect.ts`.
    const challenge = parsed.challenge ?? readMfaChallengeCookie(request);
    if (!challenge) {
        authTwoFactorCodeSentTotal.inc({ method, status: 'failure' });
        return rejectResponse(response, 401, [t('account.two-factor.challenge-invalid')]);
    }

    return twoFactorService
        .sendLoginCode(challenge, method, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) {
                authTwoFactorCodeSentTotal.inc({ method, status: 'failure' });
                return;
            }
            authTwoFactorCodeSentTotal.inc({ method, status: 'success' });
            successResponse<TwoFactorDelivery>(
                response,
                result.data,
                200,
                t('account.two-factor.code-sent')
            );
        })
        .catch((error: unknown) => {
            authTwoFactorCodeSentTotal.inc({ method, status: 'failure' });
            rejectDatabaseError(response, 'postLoginTwoFactorSend', error);
        });
};
