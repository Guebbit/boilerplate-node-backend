import type {NextFunction, Request, Response} from 'express';
import {t} from "i18next";
import Users from "../../models/users";
import nodemailer from "../../utils/nodemailer";
import {databaseErrorConverter} from "../../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";

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
 * @param next
 */
export default (req: Request<unknown, unknown, IPostResetPostData>, res: Response, next: NextFunction) =>
    Users.findOne({
        where: {
            email: req.body.email
        }
    })
        .then((user) => {
            if (!user) {
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
                    req.flash('success', [t('reset.email-sent')]);
                    res.redirect('/account/reset');
                })
        })
        .catch((error: Error | DatabaseError | ValidationError) => next(databaseErrorConverter(error)))
