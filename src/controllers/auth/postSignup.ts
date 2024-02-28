import type { Request, Response } from 'express';
import { t } from "i18next";
import Users from "../../models/users";

export interface postSignupPostData {
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
export default async (req: Request<{}, {}, postSignupPostData>, res: Response) => {

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
        imageUrl,
        password,
        passwordConfirm
    )
        .then((user) => {
            // Registration successful,
            // send to the login and wait email confirmation
            req.flash('success', [t('signup.registration-successful')]);
            return res.redirect('/account/login');
            // TODO
            // return transporter.sendMail({
            //   to: user.email || "",
            //   from: 'shop@node-complete.com',
            //   subject: 'Signup succeeded!',
            //   html: '<h1>You successfully signed up!</h1>'
            // });
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