/**
 * @module
 * `POST /account/reauth` controller — thin HTTP adapter over `accountService.reauth`.
 * The answer to a `401 REAUTH_REQUIRED` challenge from `requireFreshAuth`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { ReauthBody } from '@api/schemas.zod';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { ReauthRequest, AuthTokens } from '@types';
import { accountService } from '../services';
import { issueSession } from '../session/session';
import { authReauthTotal } from '../metrics';
import { rejectValidation } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/reauth — re-proves the caller's password and re-mints their session with a fresh
 * `auth_time`, without ending it. Reuses `issueSession`, the same tail
 * `postLogin` and `postPasswordChange` end with — this is the third caller that proves it was
 * worth pulling out.
 */
export const postReauth = (
    request: Request<unknown, unknown, ReauthRequest>,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    const parseResult = ReauthBody.safeParse(request.body);
    if (!parseResult.success) {
        authReauthTotal.inc({ status: 'failure' });
        return rejectValidation(response, parseResult.error);
    }

    return accountService
        .reauth(id, parseResult.data.password, callerContextOf(request))
        .then((result) => {
            if (!result.success) {
                authReauthTotal.inc({ status: 'failure' });
                rejectResponse(response, result.status, result.errors);
                return;
            }

            /*
             * Unlike `postPasswordChange`'s own re-mint step, nothing durable has happened yet —
             * `accountService.reauth` only compared the password, it wrote nothing and revoked no
             * session. A failed re-mint here means the WHOLE point of this endpoint (a fresh
             * `auth_time`-bearing session, to clear a step-up challenge) did not happen, so it
             * must propagate to the outer `.catch` and answer 500 — a 200 with no token would
             * claim the challenge was cleared when it was not.
             */
            return issueSession(response, id).then((token) => {
                authReauthTotal.inc({ status: 'success' });
                successResponse<AuthTokens>(response, { token }, 200, t('account.reauth.success'));
            });
        })
        .catch((error: unknown) => {
            authReauthTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'postReauth', error);
        });
};
