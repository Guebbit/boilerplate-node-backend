import type { Request, Response } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import nodemailer from "../../utils/nodemailer";

/**
 * Page POST data
 */
export interface IPostResetConfirmPostData {
    token: string,
    password: string,
    passwordConfirm: string,
}

/**
 * Ask to guest if they want to reset the password
 *
 * @param req
 * @param res
 */
export default async (req: Request<unknown, unknown, IPostResetConfirmPostData>, res: Response) => {
    const {
        password,
        passwordConfirm,
        token
    } = req.body;

    return Users.findOne({
        'tokens.token': token
    })
        .then(user => {
            // wrong token
            if (!user) {
                req.flash('error', [t("reset.token-not-found")]);
                res.redirect('/account/reset')
                return;
            }
            // change password
            return user.passwordChange(password, passwordConfirm)
                .then(() => {
                    // consume the token
                    user.tokens = user.tokens
                        .filter(({ token: t }) => token !== t );
                    user.save();
                    // send confirmation email (no need to wait)
                    nodemailer({
                            to: user.email,
                            subject: 'Password change confirmed',
                        },
                        "emailResetConfirm.ejs",
                        {
                            ...res.locals,
                            pageMetaTitle: 'Password change confirmed',
                            pageMetaLinks: [],
                            name: user.username,
                        });
                    // success message
                    req.flash('success', [t("reset.success")]);
                    res.redirect("/account/login");
                })
                .catch((issues :string[] = []) => {
                    req.flash('error', issues);
                    res.redirect('/account/reset');
                    return;
                });
        })
        .catch(err => {
            console.log("postResetConfirm ERROR", err)
            req.flash('error', [t("generic.error-unknown")]);
            res.redirect('/account/reset')
            return;
        });
}