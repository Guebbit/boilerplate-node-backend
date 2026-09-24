/**
 * @module
 * `POST /account/login` controller — checks credentials, then mints the session: a refresh token,
 * its cookies, and a short-lived access token. Success/failure metrics, audit and analytics are
 * emitted here rather than in the service — see the note below on why.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { accountService, twoFactorService, runTokenCleanup } from '../services';
import { RefreshTokenExpiryTime } from '../session/config';
import { issueSession } from '../session/session';
import { recordLoginFailure, recordLoginSuccess } from '../session/login-observability';
import { successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { rejectValidation, refused } from '@infrastructure/http/controller';
import type { LoginRequest, LoginOutcome } from '@types';
import { isUnrestrictedCaller } from '../roles';

/** The "remember me" tiers the contract declares, checked against the enum the cookies use. */
const rememberSchema = z.object({ remember: z.enum(RefreshTokenExpiryTime).optional() });

/**
 * POST /account/login
 * Authenticate user.
 * Returns a short-lived access token and sets a long-lived refresh cookie.
 */
export const postLogin = (
    // `LoginRequest | undefined`, because express 5 leaves `request.body` UNDEFINED when no parser
    // matched the content-type — not `{}`, the way express 4 did. Declaring the truth is what
    // makes the guards below necessary rather than noise a lint rule would strip.
    request: Request<Record<string, string>, unknown, LoginRequest | undefined>,
    response: Response
) => {
    /*
     * Read, not parsed against `LoginBody`. Three reasons, and only the first is about answering
     * uniformly — `accountService.login` parses anyway, so this is not where a 422 is avoided.
     *
     * Uniform:     whether the ACCOUNT EXISTS. `login` compares against `DUMMY_PASSWORD_HASH` on
     *              a miss, so an unknown address costs the same bcrypt round as a wrong password
     *              and both answer 401. That is the property worth protecting, and it holds.
     * Not uniform: the password's SHAPE. The service answers 422 for a malformed body, the way
     *              RFC 6749 §5.2 separates `invalid_request` from `invalid_grant`. All it exposes
     *              is `Password.minLength`, which `openapi.yaml` publishes; the complexity
     *              pattern deliberately lives on `PasswordNew`, for signup and reset, not here.
     * Audit:       a 422 raised HERE would return before `recordLoginFailure` and drop the
     *              attempt from the trail. The service's 422 arrives after it, and is recorded.
     * Absent body: express 5 leaves `request.body` undefined when no parser matched. The `?? {}`
     *              below turns that into an ordinary empty body rather than a synchronous
     *              `TypeError` on the destructure, so `accountService.login` reaches its own
     *              422 the same way a JSON body missing both fields would.
     */
    const { email, password } = request.body ?? {};

    /*
     * `remember` IS parsed, and first: it is not a secret, so a 422 here tells a caller nothing
     * about the credentials — while an unknown tier must not slip through to become a cookie with
     * no lifetime at all.
     */
    const tier = rememberSchema.safeParse({ remember: request.body?.remember });
    if (!tier.success) {
        rejectValidation(response, tier.error);
        return;
    }
    const { remember } = tier.data;

    return runTokenCleanup()
        .then(() => accountService.login(email, password))
        .then((result) => {
            if (refused(response, result)) {
                recordLoginFailure(request);
                return;
            }

            const { data } = result;
            const userId = data._id.toString();

            /*
             * 2FA branch: the password checked out, but the login is not complete — no
             * cookies, no access token, just a short-lived challenge naming this attempt and the
             * factors the caller may answer it with. Nothing is recorded as a login yet;
             * `postLoginTwoFactor` is what finishes it.
             */
            if (data.twoFactorEnabledAt) {
                return twoFactorService.buildLoginChallenge(data, ['pwd']).then((challenge) => {
                    successResponse<LoginOutcome>(
                        response,
                        challenge,
                        200,
                        'Two-factor authentication required'
                    );
                });
            }

            return issueSession(response, userId, remember).then((accessToken) =>
                // Read fresh from the membership — the document carries no role of its own.
                isUnrestrictedCaller(userId).then((unrestricted) => {
                    recordLoginSuccess(request, userId, unrestricted);
                    successResponse<LoginOutcome>(
                        response,
                        { token: accessToken },
                        200,
                        'Authentication successful'
                    );
                })
            );
        })
        .catch((error: unknown) => {
            // Covers the token cleanup, the credential check and the three token/cookie steps
            // after it. A failure in any of them is not a rejected login — the caller may well
            // have had the right password — so it must not be recorded as one.
            rejectDatabaseError(response, 'postLogin', error);
        });
};
