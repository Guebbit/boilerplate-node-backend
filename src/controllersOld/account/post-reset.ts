import type {Request, Response} from 'express';
import type {CastError} from "mongoose";
import {t} from "i18next";
import Users, {ETokenType} from "../../models/users";
import nodemailer from "../../utils/nodemailer";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";

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
 */
export default async (req: Request<unknown, unknown, IPostResetPostData>, res: Response) => {
    await Users.findOne({
        email: req.body.email
    })
        .then((user) => {
            // not found, something happened
            if (!user) {
                rejectResponse(res, 404, t("reset.email-not-found"));
                return
            }
            return user.tokenAdd(ETokenType.PASSWORD, 86_400_000)
                .then(token => {
                    // Send token (no need to wait)
                    if (process.env.NODE_ENV !== "test")
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        nodemailer({
                                to: req.body.email,
                                subject: 'Password reset',
                            },
                            "email-reset-request.ejs",
                            {
                                ...res.locals,
                                pageMetaTitle: 'Password reset requested',
                                pageMetaLinks: [],
                                name: user.username,
                                token,
                            });
                    // send success message
                    successResponse(res, undefined, 200, t("reset.email-sent"))
                })
        })
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}
