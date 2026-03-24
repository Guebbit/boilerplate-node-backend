import type { Request, Response, NextFunction } from 'express';
import type { IUser } from "@models/users";
import { databaseErrorConverter } from "@utils/error-helpers";
import { successResponse, rejectResponse } from "@utils/response";
import { generateToken } from "@utils/jwt";
import type { LoginRequest } from "@api/api";
import UserService from "@services/users";
import type { CastError } from "mongoose";


/**
 * Authenticate user
 * POST /account/login
 *
 * @param request
 * @param response
 * @param next
 */
export const postLogin = (request: Request<unknown, unknown, LoginRequest>, response: Response, next: NextFunction) => {

    /**
     * get POST data
     */
    const {
        email,
        password,
    } = request.body;

    /**
     * Login
     */
    return UserService.login(email, password)
        .then(({ success, data, errors }) => {
            if (!success || !data)
                return rejectResponse(response, 401, 'login - wrong credentials', errors);
            // User found and login is correct: generate and return a JWT
            const user = data.toObject<IUser>();
            const token = generateToken(user);
            return successResponse(response, {
                token,
                expiresIn: Number(process.env.NODE_JWT_EXPIRES_IN ?? 86_400),
            });
        })
        .catch((error: CastError) => next(databaseErrorConverter(error)));
};