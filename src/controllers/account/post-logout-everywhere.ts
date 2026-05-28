import type { Request, Response } from 'express';
import { successResponse } from '@utils/response';
import { ETokenType } from '@models/users';
import { destroyLoggedCookie, destroyRefreshCookie } from '@middlewares/auth-jwt';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';
import { authService } from '@services/auth';

/**
 * POST /account/logout-all
 * User logout from EVERY device.
 * Remove jwt cookie and ALL refresh tokens in the DB.
 */
export const postLogoutEverywhere = (request: Request, response: Response) => {
    const auth = request.authContext;

    // Remove all refresh tokens from DB via service (decoupled from Mongoose document)
    return (
        auth ? authService.removeAllTokens(auth.id, ETokenType.REFRESH) : Promise.resolve()
    ).then(() => {
        destroyRefreshCookie(response);
        destroyLoggedCookie(response);

        emitAuditEvent({
            action: AuditAction.AUTH_LOGOUT_ALL_SUCCEEDED,
            actor_user_id: auth?.id ?? 'anonymous',
            actor_role: auth?.admin ? 'admin' : 'user',
            outcome: 'success',
            ...extractRequestContext(request)
        });

        successResponse(response, undefined, 200, 'Logged out from all devices');
    });
};
