import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import nodemailer from "../../utils/nodemailer";
import type { CastError } from "mongoose";
import {ExtendedError} from "../../utils/error-helpers";

export interface IPostSignupPostData {
    email: string,
    username: string,
    imageUrl: string,
    password: string,
    passwordConfirm: string,
}

/**
 * Register new user
 *
 * @param req
 * @param res
 * @param next
 */
export default async (req: Request<unknown, unknown, IPostSignupPostData>, res: Response, next: NextFunction) => {

    /**
     * get POST data
     */
    const {
        email,
        username,
        imageUrl,
        password,
        passwordConfirm,
    } = req.body;

    /**
     * Login
     */
    return Users.signup(
        email,
        username,
        password,
        passwordConfirm,
        imageUrl
    )
        .then((user) => {
            // Registration confirmation (no need to wait)
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            nodemailer({
                    to: user.email,
                    subject: 'Signup succeeded!',
                },
                "emailRegistrationConfirm.ejs",
                {
                    ...res.locals,
                    pageMetaTitle: 'Signup succeeded!',
                    pageMetaLinks: [],
                    name: user.username,
                })
            // Registration successful,
            // send to the login and
            req.flash('success', [t('signup.registration-successful')]);
            return res.redirect('/account/login');
        })
        .catch((error:string[] | CastError) => {
            if(Object.prototype.hasOwnProperty.call(error, 'kind'))
                return next(new ExtendedError((error as CastError).kind, Number.parseInt((error as CastError).message), false));
            // So the user doesn't need to fill the form again
            req.flash('filled', [
                email,
                username,
            ]);
            req.flash('error', error as string[]);
            res.redirect('/account/signup');
        });
};