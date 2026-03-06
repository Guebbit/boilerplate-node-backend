import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import { nodemailer } from "../../utils/nodemailer";
import { ExtendedError } from "../../utils/error-helpers";
import type { SignupRequest } from "@api/api";

/**
 * Register new user
 *
 * @param request
 * @param response
 * @param next
 */
export const postSignup = async (request: Request<unknown, unknown, SignupRequest>, response: Response, next: NextFunction) => {

    /**
     * get POST data
     */
    const {
        email,
        username,
        imageUrl,
        password,
        passwordConfirm,
    } = request.body;

    /**
     * Signup
     */
    return Users.signup(
            email,
            username,
            password,
            passwordConfirm,
            imageUrl,
        )
        .then(({ success, data, errors }) => {
            if (!success) {
                // So the user doesn't need to fill the form again
                request.flash('filled', [
                    email,
                    username,
                ]);
                request.flash('error', [
                    t('login.invalid-data'),
                    ...errors
                ]);
                response.redirect('/account/signup');
            }
            // Registration confirmation (no need to wait)

            nodemailer({
                    to: data!.email,
                    subject: 'Signup succeeded!',
                },
                "emailRegistrationConfirm.ejs",
                {
                    ...response.locals,
                    pageMetaTitle: 'Signup succeeded!',
                    pageMetaLinks: [],
                    name: data!.username,
                })
            // Registration successful,
            // send to the login and
            request.flash('success', [t('signup.registration-successful')]);
            return response.redirect('/account/login');
        })
        .catch((error: string[] | Error) => {
            if (!Array.isArray(error))
                return next(new ExtendedError(error.message, 500))
            // So the user doesn't need to fill the form again
            request.flash('filled', [
                email,
                username,
            ]);
            request.flash('error', error);
            response.redirect('/account/signup');
            return;
        });
};