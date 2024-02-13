import type { Request, Response } from "express";
import { t } from "i18next";
import Tokens from "../../models/tokens";
import {getTargetOrderParameters} from "../orders/getTargetOrder";

/**
 *
 */
export interface getResetConfirmParameters {
    orderId: string,
}

/**
 * If token was provided (and valid), ask for new password
 *
 * @param req
 * @param res
 */
export default (req: Request & { params: getResetConfirmParameters }, res: Response) =>
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
                errorMessages: req.flash('error'),
                successMessages: req.flash('success'),
                token: token.token
            });
        })
        .catch(err => {
            req.flash('error', [t("generic.unknown-error")]);
            res.redirect('/account/reset')
        });