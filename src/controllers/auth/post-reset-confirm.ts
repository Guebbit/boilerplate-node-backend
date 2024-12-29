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
export default async (req: Request<unknown, unknown, IPostResetConfirmPostData>, res: Response, next: NextFunction) => {
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
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const { User } = token as Tokens & { User: Users } | null ?? {};
            // wrong token
            if (!token || !User) {
                req.flash('error', [t("reset.token-not-found")]);
                res.redirect('/account/reset')
                return;
            }
            // change password
            return User.passwordChange(password, passwordConfirm)
                .then(async ({success, errors = []}) => {
                    if (!success) {
                        req.flash('error', errors);
                        return res.redirect('/account/reset');
                    }
                    // consume the token
                    await token.destroy();
                    // send confirmation email (no need to wait)
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
                    return res.redirect("/account/login");
                })
                .catch((error:string[] | Error) => {
                    if(!Array.isArray(error))
                        return next(new ExtendedError(error.message, 500))
                    req.flash('error', error);
                    res.redirect('/account/reset');
                    return;
                });
        })
}
