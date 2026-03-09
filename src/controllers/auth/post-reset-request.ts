import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import Users from "../../models/users";
import { nodemailer } from "../../utils/nodemailer";
import type {CastError} from "mongoose";
import { databaseErrorConverter } from "../../utils/error-helpers";
import type { ResetRequest } from "@api/api";

/**
 * Ask to guest if they want to reset the password
 *
 * @param request
 * @param response
 * @param next
 */
export const postResetRequest = (request: Request<unknown, unknown, ResetRequest>, response: Response, next: NextFunction) =>
    Users.findOne({
        email: request.body.email
    })
        .then((user) => {
            if(!user) {
                request.flash('error', [t('reset.email-not-found')]);
                response.redirect('/account/reset');
                return;
            }
            return user.tokenAdd("password", 86_400_000)
                .then(token => {
                    // Send token (no need to wait)

                    nodemailer({
                            to: request.body.email,
                            subject: 'Password reset',
                        },
                        "email-reset-request.ejs",
                        {
                            ...response.locals,
                            pageMetaTitle: 'Password reset requested',
                            pageMetaLinks: [],
                            name: user.username,
                            token,
                        });
                    // send success message
                    request.flash('success', [t('reset.email-sent')]);
                    response.redirect('/account/reset');
                })
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)))

