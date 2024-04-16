import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import Tokens from "../../models/tokens";
import nodemailer from "../../utils/nodemailer";
import { ExtendedError } from "../../utils/error-helpers";

/**
 *
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
export default (req: Request<unknown, unknown, IPostResetConfirmPostData>, res: Response, next: NextFunction) => {
    /**
     * Post Data
     */
    const {
        password,
        passwordConfirm,
        token
    } = req.body;

    /**
     * Search user by token
     */
    return Tokens.findOne({
        where: {
            token
        },
        include: [
            Users
        ]
    })
        .then(token => {
            // retrieving User
            // eslint-disable-next-line 
            const { User } = token as Tokens & { User: Users } | null || {};
            // wrong token
            if (!token || !User) {
                req.flash('error', [t("reset.token-not-found")]);
                res.redirect('/account/reset')
                return;
            }
            // change password
            return User.passwordChange(password, passwordConfirm)
                .then(() => {
                    // consume the token
                    token.destroy();
                    // send confirmation email (no need to wait)
                    nodemailer({
                            to: User.email,
                            subject: 'Password change confirmed',
                        },
                        "emailResetConfirm.ejs",
                        {
                            ...res.locals,
                            pageMetaTitle: 'Password change confirmed',
                            pageMetaLinks: [],
                            name: User.username,
                        });
                    // success message
                    req.flash('success', [t("reset.success")]);
                    res.redirect("/account/login");
                })
                .catch((issues :string[] | Error) => {
                    if(!Array.isArray(issues))
                        return next(new ExtendedError("500", 500, issues.message, false))
                    req.flash('error', issues);
                    res.redirect('/account/reset');
                    return;
                });
        })
}
