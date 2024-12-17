import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users, {IUser} from "../../models/users";
import {CastError, Require_id} from "mongoose";
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
        .then(({ success, data, error }) => {
            if(!success || !data){
                req.flash('error', error.details);
                res.redirect('/account/login');
                return;
            }
            // User found and login is correct: Update and regenerate session
            return req.session.regenerate(() => {
                req.session.user = data.toObject<IUser>();
                req.session
                    .save(() => {
                        req.flash('success', [t('login.success')]);
                        res.redirect('/')
                    });
            });
        })
        .catch((error: CastError) => {
            if(Object.prototype.hasOwnProperty.call(error, 'kind'))
                return next(new ExtendedError(error.kind, Number.parseInt(error.message), false));
            req.flash('error', [error.kind]);
            res.redirect('/account/login');
        });
};