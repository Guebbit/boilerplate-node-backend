import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import nodemailer from "../../utils/nodemailer";
import type {CastError} from "mongoose";
import {ExtendedError} from "../../utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostResetPostData {
    email: string,
}

/**
 * Ask to guest if they want to reset the password
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request<unknown, unknown, IPostResetPostData>, res: Response, next: NextFunction) =>
    Users.findOne({
        email: req.body.email
    })
        .then((user) => {
            if(!user) {
                req.flash('error', [t('reset.email-not-found')]);
                res.redirect('/account/reset');
                return;
            }
            return user.tokenAdd("password", 86_400_000)
                .then(token => {
                    // Send token (no need to wait)
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
                    // send success message
                    req.flash('success', [t('reset.email-sent')]);
                    res.redirect('/account/reset');
                })
        })
        .catch((error: CastError) =>
            next(new ExtendedError(error.kind, Number.parseInt(error.message), false)))

