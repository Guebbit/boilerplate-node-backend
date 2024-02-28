import type { Request, Response } from "express";

/**
 * Get initial (empty) reset password page
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
    res.render('account/reset', {
        pageMetaTitle: "Reset Password",
        pageMetaLinks: [
            "/css/auth.css",
            "/css/forms.css",
        ],
        token: "",
    });