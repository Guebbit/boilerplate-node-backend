import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { successResponse } from '@infrastructure/http/response';
import { destroyLoggedCookie, destroyRefreshCookie } from '../session/cookies';
import { accountService } from '../services';
import { catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/logout
 * Log out the CURRENT session only.
 *
 * The refresh cookie is both the credential and the address: whoever presents it IS this
 * session, so no bearer token is required — mirroring `GET /account/refresh`, the other endpoint
 * that works from the cookie alone. The stored token is revoked and the cookies cleared; other
 * devices keep their own tokens and stay signed in.
 *
 * Always 200. A missing cookie or an already-revoked token means the caller is not logged in
 * here — which is the state they asked for, not an error to report.
 */
export const postLogout = (request: Request, response: Response) => {
    const refreshToken = (request.cookies as Record<string, string | undefined>).jwt;

    return accountService
        .logoutCurrentSession(refreshToken, callerContextOf(request))
        .then(() => {
            destroyRefreshCookie(response);
            destroyLoggedCookie(response);

            successResponse(response, undefined, 200, t('account.logout.success'));
        })
        .catch(catchAs(response, 'postLogout'));
};
