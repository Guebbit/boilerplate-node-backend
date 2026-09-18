/**
 * @module
 * `POST /account/login/2fa` controller — the second step of a 2FA login: verifies the challenge
 * from `POST /account/login` and the caller's code, then mints the session exactly like
 * `postLogin` does for an account with no second factor.
 */

import type { Request, Response } from 'express';
import { LoginTwoFactorBody } from '@api/schemas.zod';
import type { LoginTwoFactorRequest, AuthTokens } from '@types';
import { t } from '@infrastructure/i18n';
import { twoFactorService } from '../services';
import { issueSession } from '../session/session';
import { recordLoginSuccess } from '../session/login-observability';
import { authTwoFactorChallengeTotal } from '../metrics';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { rejectValidation } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { isUnrestrictedRole } from '@kernel/permissions';
import { rolesOf } from '@kernel/access/store';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { readMfaChallengeCookie, destroyMfaChallengeCookie } from '../oauth/mfa-redirect';

/**
 * POST /account/login/2fa — the answer to the `{ mfaRequired: true, challenge }` response from
 * `POST /account/login`. The code may come from any armed factor, or be a backup code; which one
 * it was is the service's business, not this adapter's.
 *
 * `amr: ['pwd', 'otp']` on the resulting session is the whole payoff of carrying amr as an array:
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
    const { code } = parseResult.data;
    // Omitted from the body: an OAuth-originated challenge was never sent to the client at all —
    // see `oauth/mfa-redirect.ts`. A password-originated one always has it in the body.
    const challenge = parseResult.data.challenge ?? readMfaChallengeCookie(request);
    if (!challenge) {
        authTwoFactorChallengeTotal.inc({ status: 'failure' });
        return rejectResponse(response, 401, [t('account.two-factor.challenge-invalid')]);
    }

    return twoFactorService
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
            const { user, amr } = data;
            const userId = user._id.toString();

            return issueSession(response, userId, undefined, [...amr, 'otp']).then((accessToken) =>
                // Read fresh from the membership — the document carries no role of its own.
                rolesOf(userId, DEPLOYMENT_TENANT_ID).then((roles) => {
                    authTwoFactorChallengeTotal.inc({ status: 'success' });
                    recordLoginSuccess(request, userId, isUnrestrictedRole(roles.tenant));
                    destroyMfaChallengeCookie(response);
                    successResponse<AuthTokens>(
                        response,
                        { token: accessToken },
                        200,
                        'Authentication successful'
                    );
                })
            );
        })
        .catch((error: unknown) => {
            authTwoFactorChallengeTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'postLoginTwoFactor', error);
        });
};
