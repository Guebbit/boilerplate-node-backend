/**
 * @module
 * `POST /account/login/2fa` controller — the second step of a 2FA login: verifies the challenge
 * from `POST /account/login` and the caller's code, then mints the session exactly like
 * `postLogin` does for an account with no second factor.
 */

import type { Request, Response } from 'express';
import { LoginTwoFactorBody } from '@api/schemas.zod';
import type { LoginTwoFactorRequest } from '@types';
import { accountService } from '../services';
import { issueSession } from '../session/session';
import { recordLoginSuccess } from '../session/login-observability';
import { authTwoFactorChallengeTotal } from '../metrics';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { rejectValidation } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/login/2fa — the answer to the `{ mfaRequired: true, challenge }` response from
 * `POST /account/login`. `amr: ['pwd', 'otp']` on the resulting session is the whole payoff of carrying amr as an array:
 * every guard that later demands a second factor reads it off there, unchanged.
 */
export const postLoginTwoFactor = (
    request: Request<Record<string, string>, unknown, LoginTwoFactorRequest>,
    response: Response
) => {
    const parseResult = LoginTwoFactorBody.safeParse(request.body);
    if (!parseResult.success) {
        authTwoFactorChallengeTotal.inc({ status: 'failure' });
        return rejectValidation(response, parseResult.error);
    }
    const { challenge, code } = parseResult.data;

    return accountService
        .verifyLoginChallenge(challenge, code, callerContextOf(request))
        .then((result) => {
            if (!result.success) {
                authTwoFactorChallengeTotal.inc({ status: 'failure' });
                rejectResponse(response, result.status, result.errors);
                return;
            }

            const { data } = result;
            if (data === undefined) {
                rejectResponse(response, 500, []);
                return;
            }
            const userId = data._id.toString();

            return issueSession(response, userId, undefined, ['pwd', 'otp']).then((accessToken) => {
                authTwoFactorChallengeTotal.inc({ status: 'success' });
                recordLoginSuccess(request, userId, !!data.admin);
                successResponse(response, { token: accessToken }, 200, 'Authentication successful');
            });
        })
        .catch((error: Error) => {
            authTwoFactorChallengeTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'postLoginTwoFactor', error);
        });
};
