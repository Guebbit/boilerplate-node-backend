import type { Request, Response, NextFunction } from 'express';
import { nodemailer } from "@utils/nodemailer";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { rejectResponse, successResponse } from "@utils/response";
import type { SignupRequest } from "@api/api";
import UserService from "@services/users";

/**
 * Register new user
 * POST /account/signup
 *
 * @param request
 * @param response
 * @param next
 */
export const postSignup = async (request: Request<unknown, unknown, SignupRequest>, response: Response, next: NextFunction) => {

    /**
     * get POST data
     */
    const {
        email,
        username,
        imageUrl,
        password,
        passwordConfirm,
    } = request.body;

    /**
     * Signup
     */
    return UserService.signup(
            email,
            username,
            password,
            passwordConfirm,
            imageUrl
        )
        .then(({ success, data, errors = [] }) => {
            if (!success || !data)
                return rejectResponse(response, 422, 'signup - validation error', errors);

            // Registration confirmation (no need to wait)
            nodemailer({
                    to: data.email,
                    subject: 'Signup succeeded!',
                },
                "email-registration-confirm.ejs",
                {
                    pageMetaTitle: 'Signup succeeded!',
                    pageMetaLinks: [],
                    name: data.username,
                })
                .catch(() => { /* email failure is non-fatal */ });

            // Registration successful — return created user
            return successResponse(response, data.toObject(), 201);
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
};