import type { Request, Response, NextFunction } from 'express';
import { userModel as Users, IToken } from '@models/users';
import { verifyAccessToken } from './auth-jwt';
import { rejectResponse } from '@utils/response';
import { Types } from 'mongoose';

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
            if (user) request.user = user;
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
        rejectResponse(response, 403, 'Forbidden: Access denied.');
        return;
    }
    if (!request.user.admin) {
        rejectResponse(response, 403, "Forbidden: You don't have permission.");
        return;
    }
    next();
};

/**
 * Already logged, you shouldn't be here
 *
 * @param request
 * @param response
 * @param next
 */
export const isGuest = (request: Request, response: Response, next: NextFunction) => {
    const token = getTokenBearer(request);
    if (token) {
        rejectResponse(response, 400, 'You are already logged in.');
        return;
    }
    next();
};

/**
 * Dynamically add the user id to id parameter.
 * If the user is not logged in, it will be ignored.
 *
 * Useful to just convert /me to /:id (for example)
 *
 * @param request
 * @param response
 * @param next
 */
export const isUser = (request: Request, response: Response, next: NextFunction) => {
    if (request.user?.id) request.params.id = (request.user._id as Types.ObjectId).toString();
    next();
};
