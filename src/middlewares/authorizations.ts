import type { Request, Response, NextFunction } from 'express';
import { userRepository } from '@repositories/users';
import type { IToken } from '@models/users';
import { verifyAccessToken } from './auth-jwt';
import { rejectResponse } from '@utils/response';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';

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
        .then(({ id }) => userRepository.findById(id))
        .then((user) => {
            if (user) {
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

    if (!request.authContext || !token) {
        emitAuditEvent(buildAuditEvent(request, {
            action: AuditAction.SECURITY_UNAUTHORIZED,
            actor_user_id: 'anonymous',
            actor_role: 'anonymous',
            outcome: 'failure',
            metadata: { route: request.path, method: request.method }
        }));
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
    if (!request.authContext) {
        emitAuditEvent(buildAuditEvent(request, {
            action: AuditAction.SECURITY_FORBIDDEN,
            actor_user_id: 'anonymous',
            actor_role: 'anonymous',
            outcome: 'failure',
            metadata: { route: request.path, method: request.method, reason: 'not_authenticated' }
        }));
        rejectResponse(response, 403, 'Forbidden: Access denied.');
        return;
    }
    if (!request.authContext.admin) {
        emitAuditEvent(buildAuditEvent(request, {
            action: AuditAction.SECURITY_FORBIDDEN,
            outcome: 'failure',
            metadata: { route: request.path, method: request.method, reason: 'not_admin' }
        }));
        rejectResponse(response, 403, "Forbidden: You don't have permission.");
        return;
    }
    next();
};
