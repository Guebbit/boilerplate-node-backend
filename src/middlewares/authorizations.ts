import type { Request, Response, NextFunction } from 'express';

/**
 * Unauthorized: Don't know who you are
 *
 * @param request
 * @param response
 * @param next
 */
export const isAuth = (request: Request, response: Response, next: NextFunction) => {
    if(!request.session.user)
        { response.status(401).redirect('/account/login'); return; }
    next();
}

/**
 * Forbidden: Know who you are, but you don't have permission
 *
 * @param request
 * @param response
 * @param next
 */
export const isAdmin = (request: Request, response: Response, next: NextFunction) => {
    if(!request.session.user?.admin)
        { response.status(403).redirect('/account/login'); return; }
    next();
}

/**
 * Already logged, you shouldn't be here
 *
 * @param request
 * @param response
 * @param next
 */
export const isGuest = (request: Request, response: Response, next: NextFunction) => {
    if(request.session.user)
        { response.redirect('/'); return; }
    next();
}