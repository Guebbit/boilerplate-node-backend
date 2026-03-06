import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users, {IUser} from "../../models/users";
import { ExtendedError } from "../../utils/error-helpers";
import type { CastError } from "mongoose";
import type { LoginRequest } from "@api/api";


/**
 * Authenticate user
 *
 * @param request
 * @param response
 * @param next
 */
export const postLogin = (request: Request<unknown, unknown, LoginRequest>, response: Response, next: NextFunction) => {

    /**
     * get POST data
     */
    const {
        email,
        password,
    } = request.body;

    /**
     * Login
     */
    return Users.login(email, password)
        .then(({ success, data, errors }) => {
            if(!success || !data){
                request.flash('error', errors);
                response.redirect('/account/login');
                return;
            }
            // User found and login is correct: Update and regenerate session
            request.session.regenerate(() => {
                request.session.user = data.toObject<IUser>();
                request.session
                    .save(() => {
                        request.flash('success', [t('login.success')]);
                        response.redirect('/')
                    });
            });
        })
        .catch((error: CastError) => next(new ExtendedError(error.kind, Number.parseInt(error.message))));
};