import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import type { IUser } from "@models/users";
import { ExtendedError } from "@utils/helpers-errors";
import type { CastError } from "mongoose";
import type { LoginRequest } from "@api/api";
import UserService from "@services/users";


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
    return UserService.login(email, password)
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