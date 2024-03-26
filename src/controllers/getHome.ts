import type { Request, Response } from "express";

/**
 * Homepage
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
    res.render('home', {
        pageMetaTitle: 'Home',
        pageMetaLinks: [],
    })