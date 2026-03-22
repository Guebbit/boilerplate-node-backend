import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
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
    UserRepository.findOne({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'tokens.token': request.params.token
        })
        .then((user) => {
            // not valid
            if (!user) {
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
                token: request.params.token
            });
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)))