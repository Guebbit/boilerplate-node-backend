import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@utils/jwt';
import UserRepository from '@repositories/users';
import { rejectResponse } from '@utils/response';

/**
 * Unauthorized: Don't know who you are.
 * Validates the Bearer JWT in the Authorization header.
 * On success, attaches the full user document to request.user.
 *
 * @param request
 * @param response
 * @param next
 */
export const isAuth = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
        rejectResponse(response, 401, 'Unauthorized', ['Authentication required']);
        return;
    }

    const token = authHeader.slice(7);
    try {
        const payload = verifyToken(token);
        const user = await UserRepository.findById(payload.id);
        if (!user) {
            rejectResponse(response, 401, 'Unauthorized', ['User not found']);
            return;
        }
        // Attach the full Mongoose document so downstream handlers can mutate it
        request.user = user;
        next();
    } catch {
        rejectResponse(response, 401, 'Unauthorized', ['Invalid or expired token']);
    }
};

/**
 * Forbidden: Know who you are, but you don't have permission.
 * Must be used AFTER isAuth (relies on request.user being set).
 *
 * @param request
 * @param response
 * @param next
 */
export const isAdmin = (request: Request, response: Response, next: NextFunction): void => {
    if (!request.user?.admin) {
        rejectResponse(response, 403, 'Forbidden', ['Admin access required']);
        return;
    }
    next();
};