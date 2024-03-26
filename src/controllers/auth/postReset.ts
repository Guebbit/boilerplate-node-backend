import type { Request, Response } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import nodemailer from "../../utils/nodemailer";

/**
 *
 */
export interface IPostResetPostData {
    email: string,
}

/**
 * Ask to guest if they want to reset the password
 *
 * @param req
 * @param res
 */
export default (req: Request<unknown, unknown, IPostResetPostData>, res: Response) =>
        Users.findOne({
            where: {
                email: req.body.email
            }
        })
        .then((user) => {
            if(!user) {
                req.flash('error', [t('reset.email-not-found')]);
                res.redirect('/account/reset');
                return;
            }
            const token = user.tokenAdd("password", 86400000);
            // Send token (no need to wait)
            nodemailer({
                    to: req.body.email,
                    subject: 'Password reset',
                },
                "emailResetRequest.ejs",
                {
                    ...res.locals,
                    pageMetaTitle: 'Password reset requested',
                    pageMetaLinks: [],
                    name: user.username,
                    token,
                });
            req.flash('success', [t('reset.email-sent')]);
            res.redirect('/account/reset');
        })
        .catch((err) => console.log("postReset Users.findOne ERROR", err));

