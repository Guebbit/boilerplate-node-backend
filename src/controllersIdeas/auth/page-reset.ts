import type { Request, Response } from "express";

/**
 * Get initial (empty) reset password page
 *
 * @param request
 * @param response
 */
export const pageReset = (request: Request, response: Response) =>
    response.render('account/reset', {
        pageMetaTitle: "Reset Password",
        pageMetaLinks: [
            "/css/auth.css",
            "/css/forms.css",
        ],
        token: ""
    });