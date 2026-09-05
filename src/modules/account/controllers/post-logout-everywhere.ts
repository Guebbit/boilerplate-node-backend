/**
 * @module
 * `POST /account/logout-all` controller — thin HTTP adapter over `accountService.tokenRemoveAll`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { TokenType } from '@modules/users';
import { destroyLoggedCookie, destroyRefreshCookie } from '../session/cookies';
import { accountService } from '../services';
import { catchAs } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/logout-all
 * User logout from EVERY device.
 * Remove jwt cookie and ALL refresh tokens in the DB.
 */
export const postLogoutEverywhere = (request: Request, response: Response) => {
    return accountService
        .tokenRemoveAll(authContextOf(request).id, TokenType.REFRESH, callerContextOf(request))
        .then(() => {
            destroyRefreshCookie(response);
            destroyLoggedCookie(response);

            successResponse(response, undefined, 200, 'Logged out from all devices');
        })
        .catch(catchAs(response, 'postLogoutEverywhere'));
};
