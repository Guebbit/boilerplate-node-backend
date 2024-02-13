import type { Request, Response } from 'express';

/**
 * Registration form
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) => {
    const [
        email,
        username,
        imageUrl,
    ] = req.flash('filled');

    return res.render('account/signup', {
        pageMetaTitle: "Signup",
        pageMetaLinks: [
            "/css/auth.css",
            "/css/forms.css",
        ],
        filledInputs: {
            email,
            username,
            imageUrl,
        },
    });
}