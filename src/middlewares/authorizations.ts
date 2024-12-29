import type { Request, Response, NextFunction } from 'express';

/**
 * Unauthorized: Don't know who you are
 *
 * @param req
 * @param res
 * @param next
 */
export const isAuth = (req: Request, res: Response, next: NextFunction) => {
    if(!req.session.user)
        { res.status(401).redirect('/account/login'); return; }
    next();
}

/**
 * Forbidden: Know who you are, but you don't have permission
 *
 * @param req
 * @param res
 * @param next
 */
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if(!req.session.user?.admin)
        { res.status(403).redirect('/account/login'); return; }
    next();
}

/**
 * Already logged, you shouldn't be here
 *
 * @param req
 * @param res
 * @param next
 */
export const isGuest = (req: Request, res: Response, next: NextFunction) => {
    if(req.session.user)
        { res.redirect('/'); return; }
    next();
}