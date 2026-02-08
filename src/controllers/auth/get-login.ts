import type { Request, Response } from 'express';

/**
 * Login form
 *
 * @param request
 * @param response
 */
export const getLogin = (request: Request, response: Response) =>
    response.render('account/login', {
        pageMetaTitle: "Login",
        pageMetaLinks: [
            "/css/auth.css",
            "/css/forms.css",
        ],
    })