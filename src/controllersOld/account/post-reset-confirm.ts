import type {Request, Response} from 'express';
import type {CastError} from "mongoose";
import {t} from "i18next";
import Users, {type IToken} from "../../models/users";
import nodemailer from "../../utils/nodemailer";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";

/**
 * Page GET data
 */
export interface IGetResetConfirmPostData {
    token?: IToken['token'],
}

/**
 * Page POST data
 */
export interface IPostResetConfirmPostData {
    password?: string,
    passwordConfirm?: string,
}

/**
 * Ask to guest if they want to reset the password
 *
 * @param req
 * @param res
 */
export default async (req: Request<IGetResetConfirmPostData, unknown, IPostResetConfirmPostData>, res: Response) => {
    const {
        password,
        passwordConfirm,
    } = req.body;

    const {
        token
    } = req.params;

    // wrong token
    if (!token) {
        rejectResponse(res, 404, t("reset.token-not-found"));
        return
    }

    await Users.findOne({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'tokens.token': token
    })
        .then(async user => {
            // wrong token
            if (!user) {
                rejectResponse(res, 404, t("reset.token-not-found"));
                return
            }

            /**
             * Change password
             */
            let passwordChanged = "";
            // If no password was provided, just create a new random one
            if(!password || !passwordConfirm){
                const { success, data, message } = await user.passwordRandom();
                if (!success || !data) {
                    rejectResponse(res, 500, message);
                    return
                }
                passwordChanged = data;
            } else {
                // if password is provided: change password
                const { success, status, errors } = await user.passwordChange(password, passwordConfirm);
                if (!success) {
                    rejectResponse(res, status, "Invalid Password", errors);
                    return
                }
            }

            /**
             * Consume the token and
             * Send confirmation email
             */
            await user.tokenRemove(token)
                .then(() => user.save())
                .then(() => {
                    // send confirmation email (no need to wait)
                    if (process.env.NODE_ENV !== "test")
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        nodemailer({
                                to: user.email,
                                subject: 'Password change confirmed',
                            },
                            "email-reset-confirm.ejs",
                            {
                                ...res.locals,
                                pageMetaTitle: 'Password change confirmed',
                                pageMetaLinks: [],
                                name: user.username,
                            });
                    // success message (if password was randomized, need to send it to the user this one time)
                    successResponse(res, { password: passwordChanged }, 200, t("reset.success"));
                })
        })
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}