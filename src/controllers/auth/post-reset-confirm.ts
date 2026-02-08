import type {Request, Response, NextFunction} from 'express';
import {t} from "i18next";
import Users from "../../models/users";
import { nodemailer } from "../../utils/nodemailer";
import type {CastError} from "mongoose";
import {databaseErrorConverter} from "../../utils/error-helpers";

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
 * @param request
 * @param response
 * @param next
 */
export const postResetConfirm = async (request: Request<unknown, unknown, IPostResetConfirmPostData>, response: Response, next: NextFunction) => {
    const {
        password,
        passwordConfirm,
        token
    } = request.body;

    return Users.findOne({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'tokens.token': token
    })
        .then(user => {
            // wrong token
            if (!user) {
                request.flash('error', [t("reset.token-not-found")]);
                response.redirect('/account/reset')
                return;
            }
            // change password
            return user.passwordChange(password, passwordConfirm)
                .then(async ({success, errors = []}) => {
                    if (!success) {
                        request.flash('error', errors);
                        return response.redirect('/account/reset');
                    }
                    // consume the token
                    user.tokens = user.tokens
                        .filter(({token: t}) => token !== t);
                    // save and send email
                    await user.save()
                        .then(() => {
                            // send confirmation email (no need to wait)

                            nodemailer({
                                    to: user.email,
                                    subject: 'Password change confirmed',
                                },
                                "email-reset-confirm.ejs",
                                {
                                    ...response.locals,
                                    pageMetaTitle: 'Password change confirmed',
                                    pageMetaLinks: [],
                                    name: user.username,
                                });
                            // success message
                            request.flash('success', [t("reset.success")]);
                        })
                    return response.redirect("/account/login");
                })
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)))
}