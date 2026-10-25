/**
 * @module
 * `POST /account/logout` controller — thin HTTP adapter over `accountService.logoutCurrentSession`.
 */

import type { Request, Response } from 'express';
import { noContentResponse } from '@infrastructure/http/response';
import { destroySessionCookie } from '../session/cookies';
import { accountService } from '../services';
import { sessionCredentialOf } from '../session/session';
import { catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/logout — logs out the CURRENT session only.
 * The refresh cookie is both credential and address (like `POST /account/refresh`), so no bearer
 * token is needed: the stored token is revoked and cookies cleared, other devices stay signed in.
 * Always 200 — a missing or already-revoked cookie just means "not logged in here", not an error.
 */
export const postLogout = (request: Request, response: Response) => {
    const credential = sessionCredentialOf(request);

    return accountService
        .logoutCurrentSession(credential, callerContextOf(request))
        .then(() => {
            destroySessionCookie(response);

            noContentResponse(response);
        })
        .catch(catchAs(response, 'postLogout'));
};
