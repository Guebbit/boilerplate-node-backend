import type {Request, Response} from 'express';
import Users from "../../models/users";
import type {CastError} from "mongoose";
import {rejectResponse, successResponse} from "../../utils/response";
import {
    createAccessToken,
    createRefreshToken,
    createRefreshCookie,
    ERefreshTokenExpiryTime,
    createLoggedCookie
} from "../../utils/jwt";

/**
 * Page POST data
 */
export interface IPostLoginPostData {
    email: string,
    password: string,
    remember?: ERefreshTokenExpiryTime
}

/**
 * Authenticate user
 *
 * @param req
 * @param res
 */
export default async (req: Request<unknown, unknown, IPostLoginPostData>, res: Response) => {

    /**
     * get POST data
     */
    const {
        email,
        password,
        remember
    } = req.body;

    /**
     * Login
     */
    await Users.login(email, password)
        .then(async ({status, success, data, errors}) => {
            if (!success || !data?._id)
                return rejectResponse(res, 401, "Authentication failed", errors);

            /**
             * Authentication successful,
             * create refresh token...
             */
            const refreshToken = await createRefreshToken(data._id as string, remember);
            // ...and add it to the client cookies
            createRefreshCookie(res, refreshToken, remember);
            createLoggedCookie(res, remember);

            /**
             * Send the newly created access token to the client through the response,
             * it will be used for the following requests
             */
            await createAccessToken(refreshToken)
                .then(token =>
                    successResponse(res, { token }, status, "Authentication successful")
                )
                .catch(() => rejectResponse(res, 401, "Authentication failed"))
        })
        .catch((error: CastError) => {
            // eslint-disable-next-line no-console
            console.error("------------- SERVER ERROR -------------", error);
            rejectResponse(res, Number.parseInt(error.message) || 500, error.kind);
        });
};