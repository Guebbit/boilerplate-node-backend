/**
 * @module
 * `POST /account/logout-all` controller — thin HTTP adapter over `accountService.logoutEverywhere`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { destroyLoggedCookie, destroyRefreshCookie } from '../session/cookies';
import { accountService } from '../services';
import { catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/logout-all
 * User logout from EVERY device.
 * Remove jwt cookie and ALL refresh tokens in the DB, and move the session epoch so access tokens
 * already handed out stop working too. The caller is signed out as well: no re-mint here.
 */
export const postLogoutEverywhere = (request: Request, response: Response) => {
    return accountService
        .logoutEverywhere(request.authContext!.id, callerContextOf(request))
        .then(() => {
            destroyRefreshCookie(response);
            destroyLoggedCookie(response);

            successResponse(response, undefined, 200, 'Logged out from all devices');
        })
        .catch(catchAs(response, 'postLogoutEverywhere'));
};
