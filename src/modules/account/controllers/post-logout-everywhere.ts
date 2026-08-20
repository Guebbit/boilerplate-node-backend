import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { TokenType } from '@modules/users';
import { destroyLoggedCookie, destroyRefreshCookie } from '../session/cookies';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { accountService } from '../services';
import { catchAs } from '@infrastructure/http/controller';
import { authContextOf } from '@infrastructure/http/request';

/**
 * POST /account/logout-all
 * User logout from EVERY device.
 * Remove jwt cookie and ALL refresh tokens in the DB.
 */
export const postLogoutEverywhere = (request: Request, response: Response) => {
    return accountService
        .tokenRemoveAll(authContextOf(request).id, TokenType.REFRESH)
        .then(() => {
            destroyRefreshCookie(response);
            destroyLoggedCookie(response);

            emitAuditEvent(
                buildAuditEvent(request, {
                    action: accountAuditActions.AUTH_LOGOUT_ALL_SUCCEEDED,
                    outcome: 'success'
                })
            );

            successResponse(response, undefined, 200, 'Logged out from all devices');
        })
        .catch(catchAs(response, 'postLogoutEverywhere'));
};
