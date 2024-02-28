import type { Request, Response } from 'express';
import { randomBytes } from "crypto";
import { t } from "i18next";
import { z } from "zod";
import Users from "../../models/users";

/**
 * Page POST data
 */
export interface postResetPostData {
    email: string,
}

/**
 * Ask to guest if they want to reset the password
 *
 * @param req
 * @param res
 */
export default (req: Request<{}, {}, postResetPostData>, res: Response) =>
    Users.findOne({
        email: req.body.email
    })
        .then((user) => {
            if(!user) {
                req.flash('error', [t('reset.email-not-found')]);
                res.redirect('/account/reset');
                return;
            }
            user.tokenAdd("password", 86400000);
            req.flash('success', [t('reset.email-sent')]);
            res.redirect('/account/reset');
        })
        .catch((err) => console.log("postReset Users.findOne ERROR", err));

