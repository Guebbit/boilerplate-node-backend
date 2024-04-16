import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import type { CastError } from "mongoose";
import { ExtendedError } from "../../utils/error-helpers";

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
        .then((user) => {
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
        .catch((issues :string[] | CastError) => {
            if(Object.prototype.hasOwnProperty.call(issues, 'kind'))
                return next(new ExtendedError((issues as CastError).kind, parseInt((issues as CastError).message), "", false));
            req.flash('error', issues as string[]);
            res.redirect('/account/login');
        });
};