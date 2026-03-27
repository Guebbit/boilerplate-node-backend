import type { Request, Response, NextFunction } from 'express';
import { t } from "i18next";
import { nodemailer } from "@utils/nodemailer";

import { databaseErrorConverter } from "@utils/error-helpers";
import type { PasswordResetRequest } from "@api/api";
import UserRepository from "@repositories/users";
import UserService from "@services/users";

/**
 * Ask to guest if they want to reset the password
 *
 * @param request
 * @param response
 * @param next
 */
export const postResetRequest = (request: Request<unknown, unknown, PasswordResetRequest>, response: Response, next: NextFunction) =>
    UserRepository.findOne({
        email: request.body.email
    })
        .then((user) => {
            if(!user) {
                request.flash('error', [t('reset.email-not-found')]);
                response.redirect('/account/reset');
                return;
            }
            return UserService.tokenAdd(user, "password", 86_400_000)
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
        .catch((error: Error) => next(databaseErrorConverter(error)))

