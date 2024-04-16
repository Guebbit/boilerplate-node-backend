import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import nodemailer from "../../utils/nodemailer";
import type { CastError } from "mongoose";
import { ExtendedError } from "../../utils/error-helpers";

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
 * @param next
 */
export default async (req: Request<unknown, unknown, IPostResetConfirmPostData>, res: Response, next: NextFunction) => {
    const {
        password,
        passwordConfirm,
        token
    } = req.body;

    return Users.findOne({
        // eslint-disable-next-line
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
                .catch((issues :string[] | CastError) => {
                    // bounced in the next catch
                    if(!Array.isArray(issues))
                        throw issues;
                    req.flash('error', issues);
                    res.redirect('/account/reset');
                });
        })
        .catch((error: CastError) =>
            next(new ExtendedError(error.kind, parseInt(error.message), "", false)))
}