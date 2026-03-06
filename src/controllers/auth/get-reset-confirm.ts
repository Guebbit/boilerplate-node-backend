import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Tokens from "../../models/tokens";
import { ExtendedError } from "../../utils/error-helpers";

/**
 *
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
export const getResetConfirm = (request: Request & {
    params: IGetResetConfirmParameters
}, response: Response, next: NextFunction) =>
    Tokens.findOne({
            where: {
                token: request.params.token
            }
        })
        .then(token => {
            // not valid
            if (!token) {
                request.flash('error', [t("reset.token-not-found")]);
                response.redirect('/account/reset')
                return;
            }
            // valid, next step: change password
            return response.render('account/reset', {
                pageMetaTitle: "Reset Password",
                pageMetaLinks: [
                    "/css/auth.css",
                    "/css/forms.css",
                ],
                token: token.token
            });
        })
        .catch((error: Error) =>
            next(new ExtendedError(error.message, 500))
        )