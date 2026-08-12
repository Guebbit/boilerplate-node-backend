import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { ETokenType } from '@modules/users';
import { destroyLoggedCookie, destroyRefreshCookie } from '../cookies';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { authService } from '../service';

/**
 * POST /account/logout-all
 * User logout from EVERY device.
 * Remove jwt cookie and ALL refresh tokens in the DB.
 */
export const postLogoutEverywhere = (request: Request, response: Response) => {
    const auth = request.authContext;
    return (auth ? authService.tokenRemoveAll(auth.id, ETokenType.REFRESH) : Promise.resolve())
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
        .catch((error: Error) => {
            rejectDatabaseError(response, 'postLogoutEverywhere', error);
        });
};
