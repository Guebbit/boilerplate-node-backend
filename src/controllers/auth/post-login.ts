import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users, {IUser} from "../../models/users";
import { ExtendedError } from "../../utils/error-helpers";
import type { CastError } from "mongoose";

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
export default (req: Request<unknown, unknown, IPostLoginPostData>, res: Response, next: NextFunction) => {

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
        .then(({ success, data, errors }) => {
            if(!success || !data){
                req.flash('error', errors);
                res.redirect('/account/login');
                return;
            }
            // User found and login is correct: Update and regenerate session
            req.session.regenerate(() => {
                req.session.user = data.toObject<IUser>();
                req.session
                    .save(() => {
                        req.flash('success', [t('login.success')]);
                        res.redirect('/')
                    });
            });
        })
        .catch((error: CastError) => next(new ExtendedError(error.kind, Number.parseInt(error.message))));
};