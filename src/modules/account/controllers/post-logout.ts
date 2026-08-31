/**
 * @module
 * `POST /account/logout` controller — thin HTTP adapter over `accountService.logoutCurrentSession`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { successResponse } from '@infrastructure/http/response';
import { destroyLoggedCookie, destroyRefreshCookie } from '../session/cookies';
import { accountService } from '../services';
import { catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/logout — logs out the CURRENT session only.
 * The refresh cookie is both credential and address (like `GET /account/refresh`), so no bearer
 * token is needed: the stored token is revoked and cookies cleared, other devices stay signed in.
 * Always 200 — a missing or already-revoked cookie just means "not logged in here", not an error.
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
