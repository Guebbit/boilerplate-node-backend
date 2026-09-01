/**
 * @module
 * `POST /account/reauth` controller — thin HTTP adapter over `accountService.reauth`.
 * The answer to a `401 REAUTH_REQUIRED` challenge from `requireFreshAuth`.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { ReauthBody } from '@api/schemas.zod';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { ReauthRequest } from '@types';
import { accountService } from '../services';
import { issueSession } from '../session/session';
import { authReauthTotal } from '../metrics';
import { rejectValidation } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/reauth — re-proves the caller's password and re-mints their session with a fresh
 * `auth_time`, without ending it. Reuses `issueSession` (1.1's extraction), the same tail
 * `postLogin` and `postPasswordChange` end with — this is the third caller that proves it was
 * worth pulling out.
 */
export const postReauth = (
    request: Request<unknown, unknown, ReauthRequest>,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = authContextOf(request);

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
             * The password proof has already succeeded by this point — only the re-mint is left.
             * Same reasoning `postPasswordChange` applies: if issueSession fails, the response
             * must still say success rather than 500ing over a step-up prompt the caller already
             * answered correctly.
             */
            return issueSession(response, id)
                .then((token) => {
                    authReauthTotal.inc({ status: 'success' });
                    successResponse(response, { token }, 200, t('account.reauth.success'));
                })
                .catch(() => {
                    authReauthTotal.inc({ status: 'success' });
                    successResponse(response, undefined, 200, t('account.reauth.success'));
                });
        })
        .catch((error: CastError | Error) => {
            authReauthTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'postReauth', error);
        });
};
