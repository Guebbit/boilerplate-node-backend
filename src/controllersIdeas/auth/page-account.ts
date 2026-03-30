import type { Request, Response } from "express";

/**
 * Get the current user's profile page (GET /account)
 *
 * @param request
 * @param response
 */
export const pageAccount = (request: Request, response: Response) =>
    response.render('account/profile', {
        pageMetaTitle: 'My Account',
        pageMetaLinks: [
            "/css/forms.css"
        ],
        user: request.session.user,
    });
