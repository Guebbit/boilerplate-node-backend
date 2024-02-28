import type { Request, Response } from 'express';
import { t } from "i18next";
import Users from "../../models/users";

/**
 * Page POST data
 */
export interface postLoginPostData {
    email: string,
    password: string,
}


/**
 * Authenticate user
 *
 * @param req
 * @param res
 */
export default async (req: Request<{}, {}, postLoginPostData>, res: Response) => {

    /**
     * get POST data
     */
    const {
        email,
        password,
    } = req.body;

    /**
     * Login
     */
    return Users.login(email, password)
        .then((user) => {
            if(!user)
                return res.redirect('/account/login');
            // User found and login is correct: Update and regenerate session
            return req.session.regenerate(() => {
                req.session.user = user.toObject();
                req.session
                    .save(() => {
                        req.flash('success', [t('login.success')]);
                        res.redirect('/')
                    });
            });
        })
        .catch((issues :string[] = []) => {
            req.flash('error', issues);
            res.redirect('/account/login');
            return;
        });
};