import type { Request, Response } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import nodemailer from "../../utils/nodemailer";

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
 */
export default async (req: Request<unknown, unknown, IPostSignupPostData>, res: Response) => {

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
     * Signup
     */
    return Users.signup(
        email,
        username,
        imageUrl,
        password,
        passwordConfirm
    )
        .then((user) => {
            // Registration confirmation (no need to wait)
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
        .catch((issues :string[] = []) => {
            // So the user doesn't need to fill the form again
            req.flash('filled', [
                email,
                username,
                imageUrl,
            ]);
            req.flash('error', issues);
            res.redirect('/account/signup');
            return;
        });
};