import type { Request, Response, NextFunction } from 'express';
import { userModel as Users, IToken } from '@models/users';
import { verifyAccessToken } from './auth-jwt';
import { rejectResponse } from '@utils/response';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

/**
 * Get token (and strip it from "Bearer" prefix)
 * @param request
 */
export const getTokenBearer = (request: Request) =>
    request.header('Authorization')?.split(' ')[1] as IToken['token'] | undefined;

/**
 * Get user data (if authenticated, otherwise go on)
 *
 * @param request
 * @param response
 * @param next
 */
export const getAuth = (request: Request, response: Response, next: NextFunction) => {
    const token = getTokenBearer(request);

    if (!token) {
        next();
        return;
    }

    verifyAccessToken(token)
        .then(({ id }) => Users.findById(id))
        .then((user) => {
            if (user) {
                request.user = user;
                // DIP: populate transport-safe auth context DTO
                request.authContext = {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    admin: user.admin ?? false,
                    imageUrl: user.imageUrl
                };
            }
        })
        .catch(() => {
            // Invalid or expired token — proceed without authenticated user
        })
        .finally(next);
};

/**
 * Unauthorized: Don't know who you are
 *
 * @param request
 * @param response
 * @param next
 */
export const isAuth = (request: Request, response: Response, next: NextFunction) => {
    const token = getTokenBearer(request);

    if (!request.user || !token) {
        emitAuditEvent({
            action: AuditAction.SECURITY_UNAUTHORIZED,
            actor_user_id: 'anonymous',
            actor_role: 'anonymous',
            outcome: 'failure',
            ...extractRequestContext(request),
            metadata: { route: request.path, method: request.method }
        });
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }

    next();
};

/**
 * Always AFTER isAuth
 *
 * @param request
 * @param response
 * @param next
 */
export const isAdmin = (request: Request, response: Response, next: NextFunction) => {
    if (!request.user) {
        emitAuditEvent({
            action: AuditAction.SECURITY_FORBIDDEN,
            actor_user_id: 'anonymous',
            actor_role: 'anonymous',
            outcome: 'failure',
            ...extractRequestContext(request),
            metadata: { route: request.path, method: request.method, reason: 'not_authenticated' }
        });
        rejectResponse(response, 403, 'Forbidden: Access denied.');
        return;
    }
    if (!request.user.admin) {
        emitAuditEvent({
            action: AuditAction.SECURITY_FORBIDDEN,
            actor_user_id: request.user.id,
            actor_role: 'user',
            outcome: 'failure',
            ...extractRequestContext(request),
            metadata: { route: request.path, method: request.method, reason: 'not_admin' }
        });
        rejectResponse(response, 403, "Forbidden: You don't have permission.");
        return;
    }
    next();
};
