import type { Request, Response } from 'express';

/**
 * User logout: destroy session
 *
 * @param request
 * @param response
 */
export const getLogout = (request: Request, response: Response) => {
    request.session.destroy(() => response.redirect('/'));
};
