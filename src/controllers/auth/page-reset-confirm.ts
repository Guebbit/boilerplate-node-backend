import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import { databaseErrorConverter } from "@utils/error-helpers";
import TokenRepository from "@repositories/tokens";
import UserRepository from "@repositories/users";

/**
 * This token is provided in the url within the email that has been sent to the user
 */
export interface IGetResetConfirmParameters {
    token: string,
}

/**
 * If token was provided (and valid), ask for new password
 *
 * @param request
 * @param response
 * @param next
 */
export const pageResetConfirm = (request: Request & {
    params: IGetResetConfirmParameters
}, response: Response, next: NextFunction) =>
    TokenRepository.findOne({ token: request.params.token })
        .then(async (tokenRow) => {
            if (!tokenRow) {
                request.flash('error', [t("reset.token-not-found")]);
                response.redirect('/account/reset');
                return;
            }
            const user = await UserRepository.findById(tokenRow.userId);
            if (!user) {
                request.flash('error', [t("reset.token-not-found")]);
                response.redirect('/account/reset');
                return;
            }
            return response.render('account/reset', {
                pageMetaTitle: "Reset Password",
                pageMetaLinks: [
                    "/css/auth.css",
                    "/css/forms.css",
                ],
                token: request.params.token
            });
        })
        .catch((error: Error) => next(databaseErrorConverter(error)));
