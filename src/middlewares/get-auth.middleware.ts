import type { Request, Response, NextFunction } from 'express';
import Users from '@models/users';
import { verifyAccessToken } from '@middlewares/jwt-auth';

/**
 * Extract Bearer token from the Authorization header.
 */
export const getTokenBearer = (request: Request): string | undefined =>
    request.header('Authorization')?.split(' ')[1];

/**
 * Optional-auth middleware – NestJS functional middleware applied globally.
 * Populates request.user when a valid JWT access token is present.
 * Proceeds silently if no token is provided or the token is invalid/expired.
 *
 * Replaces the Express getAuth middleware from middlewares/authorizations.ts.
 */
export const getAuthMiddleware = async (
    request: Request,
    _response: Response,
    next: NextFunction,
): Promise<void> => {
    const token = getTokenBearer(request);

    if (!token) {
        next();
        return;
    }

    try {
        const { id } = await verifyAccessToken(token);
        const user = await Users.findById(id);
        if (user)
            request.user = user;
    } catch {
        // Invalid or expired token — proceed without authenticated user
    }

    next();
};
