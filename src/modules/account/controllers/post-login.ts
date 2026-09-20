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
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { rejectValidation } from '@infrastructure/http/controller';
import type { LoginRequest, LoginOutcome } from '@types';
import { isUnrestrictedRole } from '@kernel/permissions';
import { rolesOf } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';

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
     * Read, not parsed against `LoginBody` — a security decision, not an omission.
     * A login must answer ONE way for every wrong credential: parsing first would 422 a
     * too-short password while a wrong-but-valid-length one gets 401, leaking info about the
     * guess — and would reject before `recordLoginFailure`, dropping the attempt from the audit
     * trail. The stored-hash check below is the only thing that decides the outcome.
     *
     * An absent body falls through the same way a wrong one does, for that same reason: a login
     * sent with the wrong content-type must not be distinguishable from a login sent with the
     * wrong password. It used to throw here and answer 500, which was exactly that distinction.
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
            if (!result.success) {
                recordLoginFailure(request);
                rejectResponse(response, result.status, result.errors);
                return;
            }

            const { data } = result;
            if (data === undefined) {
                // A success verdict without a user is a broken service contract, not a login failure.
                rejectResponse(response, 500, []);
                return;
            }
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
                rolesOf(userId, DEPLOYMENT_TENANT_ID).then((roles) => {
                    recordLoginSuccess(request, userId, isUnrestrictedRole(roles.tenant));
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
