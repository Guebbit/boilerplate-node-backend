/**
 * @module
 * `POST /account/logout-all` controller — thin HTTP adapter over `accountService.logoutEverywhere`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { destroySessionCookie } from '../session/cookies';
import { accountService } from '../services';
import { catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/logout-all
 * User logout from EVERY device.
 * Remove the refresh cookie and ALL refresh tokens in the DB, and move the session epoch so access tokens
 * already handed out stop working too. The caller is signed out as well: no re-mint here.
 */
export const postLogoutEverywhere = (request: Request, response: Response) => {
    return accountService
        .logoutEverywhere(request.authContext!.id, callerContextOf(request))
        .then((result) => {
            // A failed revocation must not read as success: the caller would believe every
            // device is out while a stolen one keeps working.
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }

            destroySessionCookie(response);

            successResponse(response, undefined, 200, t('account.logout.all-success'));
        })
        .catch(catchAs(response, 'postLogoutEverywhere'));
};
