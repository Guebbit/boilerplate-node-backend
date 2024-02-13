import type { Request, Response } from 'express';

/**
 * User logout: destroy session
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
    req.session.destroy(error => res.redirect('/'));