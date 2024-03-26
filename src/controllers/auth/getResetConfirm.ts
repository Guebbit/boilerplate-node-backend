import type { Request, Response } from "express";
import { t } from "i18next";
import Users from "../../models/users";

/**
 * Url parameters
 */
export interface IGetResetConfirmParameters {
    token: string,
}

/**
 * If token was provided (and valid), ask for new password
 *
 * @param req
 * @param res
 */
export default (req: Request & { params: IGetResetConfirmParameters }, res: Response) =>
    Users.findOne({
        'tokens.token': req.params.token
    })
        .then(async (user) => {
            // not valid
            if (!user) {
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
                token: req.params.token
            });
        })
        .catch(() => {
            req.flash('error', [t("generic.error-unknown")]);
            res.redirect('/account/reset')
        });