import type { Request, Response } from 'express';
import { t } from "i18next";
import Users from "../../models/users";

/**
 * Page POST data
 */
export interface postResetConfirmPostData {
    token: string,
    password: string,
    passwordConfirm: string,
}

/**
 * Ask to guest if they want to reset the password
 *
 * @param req
 * @param res
 */
export default async (req: Request<{}, {}, postResetConfirmPostData>, res: Response) => {
    const {
        password,
        passwordConfirm,
        token
    } = req.body;

    return Users.findOne({
        'tokens.token': token
    })
        .then(user => {

            // wrong token
            if (!user) {
                req.flash('error', [t("reset.token-not-found")]);
                res.redirect('/account/reset')
                return;
            }

            // change password
            return user.passwordChange(password, passwordConfirm)
                .then(() => {
                    // success message
                    req.flash('success', [t("reset.success")]);
                    res.redirect("/account/login");
                })
                .catch((issues :string[] = []) => {
                    req.flash('error', issues);
                    res.redirect('/account/reset');
                    return;
                });
        })
        .catch(err => {
            console.log("postResetConfirm ERROR", err)
            req.flash('error', [t("generic.unknown-error")]);
            res.redirect('/account/reset')
            return;
        });
}