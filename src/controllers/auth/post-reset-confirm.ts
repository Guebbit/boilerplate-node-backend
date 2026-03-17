import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import Tokens from "../../models/tokens";
import { nodemailer } from "../../utils/nodemailer";
import { ExtendedError } from "../../utils/error-helpers";
import type { PasswordResetConfirmRequest } from "@api/api";

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
                request.flash('error', [t("reset.token-not-found")]);
                response.redirect('/account/reset')
                return;
            }
            // change password
            return User.passwordChange(password, passwordConfirm)
                .then(async ({ success, errors = [] }) => {
                    if (!success) {
                        request.flash('error', errors);
                        return response.redirect('/account/reset');
                    }
                    // consume the token
                    await token.destroy();
                    // send confirmation email (no need to wait)

                    nodemailer({
                            to: User.email,
                            subject: 'Password change confirmed',
                        },
                        "emailResetConfirm.ejs",
                        {
                            ...response.locals,
                            pageMetaTitle: 'Password change confirmed',
                            pageMetaLinks: [],
                            name: User.username,
                        });
                    // success message
                    request.flash('success', [t("reset.success")]);
                    return response.redirect("/account/login");
                })
                .catch((error: string[] | Error) => {
                    if (!Array.isArray(error))
                        return next(new ExtendedError(error.message, 500))
                    request.flash('error', error);
                    response.redirect('/account/reset');
                    return;
                });
        })
}
