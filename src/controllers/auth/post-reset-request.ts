import type { Request, Response, NextFunction } from 'express';
import { nodemailer } from "@utils/nodemailer";
import type {CastError} from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { rejectResponse, successResponse } from "@utils/response";
import type { PasswordResetRequest } from "@api/api";
import UserRepository from "@repositories/users";
import UserService from "@services/users";

/**
 * Request a password reset token
 * POST /account/reset
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
            if (!user)
                return rejectResponse(response, 422, 'reset - email not found', ['Email not found']);
            return UserService.tokenAdd(user, "password", 86_400_000)
                .then(token => {
                    // Send token (no need to wait)
                    nodemailer({
                            to: request.body.email,
                            subject: 'Password reset',
                        },
                        "email-reset-request.ejs",
                        {
                            pageMetaTitle: 'Password reset requested',
                            pageMetaLinks: [],
                            name: user.username,
                            token,
                        })
                        .catch(() => { /* email failure is non-fatal */ });
                    return successResponse(response, undefined, 200, 'Password reset email sent');
                });
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));

