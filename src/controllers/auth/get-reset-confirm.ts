import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Users from "../../models/users";
import type { CastError } from "mongoose";
import { ExtendedError } from "../../utils/error-helpers";

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
 * @param next
 */
export default (req: Request & { params: IGetResetConfirmParameters }, res: Response, next: NextFunction) =>
    Users.findOne({
        // eslint-disable-next-line
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
        .catch((error: CastError) =>
            next(new ExtendedError(error.kind, parseInt(error.message), "", false)))