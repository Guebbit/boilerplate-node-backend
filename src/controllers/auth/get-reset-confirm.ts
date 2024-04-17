import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Tokens from "../../models/tokens";
import { ExtendedError } from "../../utils/error-helpers";

/**
 *
 */
export interface IGetResetConfirmParameters {
    orderId: string,
}

/**
 * If token was provided (and valid), ask for new password
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request & { params: IGetResetConfirmParameters }, res: Response, next: NextFunction) =>
    Tokens.findOne({
        where: {
            token: req.params.token
        }
    })
        .then(token => {
            // not valid
            if (!token) {
                req.flash('error', [t("reset.token-not-found")]);
                res.redirect('/account/reset')
                return;
            }
            // valid, next step: change password
            return res.render('account/reset', {
                pageMetaTitle: "Reset Password",
                pageMetaLinks: [
                    "/css/auth.css",
                    "/css/forms.css",
                ],
                token: token.token
            });
        })
        .catch((error: Error) =>
            next(new ExtendedError("500", 500, error.message, false)))