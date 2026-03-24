import type { Request, Response, NextFunction } from 'express';
import { nodemailer } from "@utils/nodemailer";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { rejectResponse, successResponse } from "@utils/response";
import type { PasswordResetConfirmRequest } from "@api/api";
import UserRepository from "@repositories/users";
import UserService from "@services/users";

/**
 * Confirm password reset with token
 * POST /account/reset-confirm
 *
 * @param request
 * @param response
 * @param next
 */
export const postResetConfirm = async (request: Request<unknown, unknown, PasswordResetConfirmRequest>, response: Response, next: NextFunction) => {
    /**
     * Post Data
     */
    const {
        password,
        passwordConfirm,
        token
    } = request.body;

    /**
     * Search user by token
     */
    return UserRepository.findOne({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'tokens.token': token
        })
        .then(user => {
            // wrong token
            if (!user)
                return rejectResponse(response, 422, 'reset-confirm - invalid token', ['Invalid or expired reset token']);
            // change password
            return UserService.passwordChange(user, password, passwordConfirm)
                .then(async ({ success, errors = [] }) => {
                    if (!success)
                        return rejectResponse(response, 422, 'reset-confirm - validation error', errors);
                    // consume the token
                    user.tokens = user.tokens
                        .filter(({ token: t }) => token !== t);
                    // save and send confirmation email
                    await UserRepository.save(user)
                        .then(() => {
                            // send confirmation email (no need to wait)
                            nodemailer({
                                    to: user.email,
                                    subject: 'Password change confirmed',
                                },
                                "email-reset-confirm.ejs",
                                {
                                    pageMetaTitle: 'Password change confirmed',
                                    pageMetaLinks: [],
                                    name: user.username,
                                })
                                .catch(() => { /* email failure is non-fatal */ });
                        });
                    return successResponse(response, undefined, 200, 'Password changed successfully');
                });
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
};
