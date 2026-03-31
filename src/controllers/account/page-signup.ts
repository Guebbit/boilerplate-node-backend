import type { Request, Response } from 'express';

/**
 * Registration form
 *
 * @param request
 * @param response
 */
export const pageSignup = (request: Request, response: Response) => {
    const [email, username] = request.flash('filled');

    return response.render('account/signup', {
        pageMetaTitle: 'Signup',
        pageMetaLinks: ['/css/auth.css', '/css/forms.css'],
        filledInputs: {
            email,
            username
        }
    });
};
