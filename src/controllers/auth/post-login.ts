import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import { ExtendedError } from "../../utils/error-helpers";
import type { LoginRequest } from "@api/api";

/**
 * Authenticate user
 *
 * @param request
 * @param response
 * @param next
 */
export const postLogin = async (request: Request<unknown, unknown, LoginRequest>, response: Response, next: NextFunction) => {

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
            if (!success || !data) {
                request.flash('error', errors);
                response.redirect('/account/login');
                return;
            }
            // User found and login is correct: Update and regenerate session
            request.session.regenerate(() => {
                request.session.user = data
                request.flash('success', [ t('login.success') ]);
                request.session
                    .save(() => {
                        response.redirect('/')
                    });
            });
        })
        .catch((error: string[] | Error) => {
            if (!Array.isArray(error))
                return next(new ExtendedError(error.message, 500))
            request.flash('error', error);
            response.redirect('/account/login');
        });
};