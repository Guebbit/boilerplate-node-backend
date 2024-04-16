import type { Request, Response } from 'express';

/**
 * Login form
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
    res.render('account/login', {
        pageMetaTitle: "Login",
        pageMetaLinks: [
            "/css/auth.css",
            "/css/forms.css",
        ],
    })