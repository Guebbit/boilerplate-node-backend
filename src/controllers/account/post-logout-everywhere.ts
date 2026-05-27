import type { Request, Response } from 'express';
import { successResponse } from '@utils/response';
import { ETokenType } from '@models/users';
import { destroyLoggedCookie, destroyRefreshCookie } from '@middlewares/auth-jwt';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

/**
 * POST /account/logout-all
 * User logout from EVERY device.
 * Remove jwt cookie and ALL refresh tokens in the DB.
 */
export const postLogoutEverywhere = (request: Request, response: Response) => {
    // remove refresh token from DB (requires Mongoose document method)
    return (
        request.user ? request.user.tokenRemoveAll(ETokenType.REFRESH) : Promise.resolve()
    ).then(() => {
        destroyRefreshCookie(response);
        destroyLoggedCookie(response);

        // DIP: use authContext DTO for audit metadata
        const auth = request.authContext;
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
