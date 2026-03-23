import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import { nodemailer } from "@utils/nodemailer";
import { databaseErrorConverter } from "@utils/error-helpers";
import type { PasswordResetConfirmRequest } from "@api/api";
import UserRepository from "@repositories/users";
import UserService from "@services/users";

/**
 * Ask to guest if they want to reset the password
 *
 * @param request
 * @param response
 * @param next
 */
export const postResetConfirm = async (request: Request<unknown, unknown, PasswordResetConfirmRequest>, response: Response, next: NextFunction) => {
    /**
     * Post Data
     */
    const {
        password,
        passwordConfirm,
        token
    } = request.body;

    /**
     * Search user by token
     */
    return UserRepository.findOne({
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
            return UserService.passwordChange(user, password, passwordConfirm)
                .then(async ({ success, errors = [] }) => {
                    if (!success) {
                        request.flash('error', errors);
                        return response.redirect('/account/reset');
                    }
                    // consume the token
                    await UserRepository.deleteToken(token)
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
        .catch((error: Error) => next(databaseErrorConverter(error)))
}