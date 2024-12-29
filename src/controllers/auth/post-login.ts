import type {Request, Response, NextFunction} from 'express';
import {t} from "i18next";
import Users from "../../models/users";
import {ExtendedError} from "../../utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostLoginPostData {
    email: string,
    password: string,
}


/**
 * Authenticate user
 *
 * @param req
 * @param res
 * @param next
 */
export default async (req: Request<unknown, unknown, IPostLoginPostData>, res: Response, next: NextFunction) => {

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
        .then(({success, data, errors}) => {
            if (!success || !data) {
                req.flash('error', errors);
                res.redirect('/account/login');
                return;
            }
            // User found and login is correct: Update and regenerate session
            req.session.regenerate(() => {
                req.session.user = data
                req.flash('success', [t('login.success')]);
                req.session
                    .save(() => {
                        res.redirect('/')
                    });
            });
        })
        .catch((error: string[] | Error) => {
            if (!Array.isArray(error))
                return next(new ExtendedError(error.message, 500))
            req.flash('error', error);
            res.redirect('/account/login');
        });
};