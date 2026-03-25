import type { Request, Response, NextFunction } from 'express';

/**
 * JSON-API version of isAuth.
 * Returns 401 JSON instead of redirecting to the login page.
 *
 * @param request
 * @param response
 * @param next
 */
export const isApiAuth = (request: Request, response: Response, next: NextFunction): void => {
    if (!request.session.user) {
        response.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
            },
        });
        return;
    }
    next();
};

/**
 * JSON-API version of isAdmin.
 * Returns 403 JSON instead of redirecting to the login page.
 *
 * @param request
 * @param response
 * @param next
 */
export const isApiAdmin = (request: Request, response: Response, next: NextFunction): void => {
    if (!request.session.user?.admin) {
        response.status(403).json({
            success: false,
            error: {
                code: 'FORBIDDEN',
                message: 'Admin access required',
            },
        });
        return;
    }
    next();
};
