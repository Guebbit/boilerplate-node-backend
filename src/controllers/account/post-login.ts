import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import UserService from '@services/users';
import {
    createRefreshToken,
    createRefreshCookie,
    createLoggedCookie,
    createAccessToken,
    ERefreshTokenExpiryTime
} from '@middlewares/auth-jwt';
import { successResponse, rejectResponse } from '@utils/response';
import type { LoginRequest } from '@types';
import { runTokenCleanup } from '@utils/token-cleanup';

/**
 * POST /account/login
 * Authenticate user.
 * Returns a short-lived access token and sets a long-lived refresh cookie.
 */
const postLogin = (
    request: Request<unknown, unknown, LoginRequest & { remember?: ERefreshTokenExpiryTime }>,
    response: Response
): Promise<void> => {
    /**
     * Get POST data
     */
    const { email, password, remember } = request.body;

    /**
     * Login
     */
    return UserService.login(email, password).then((result) => {
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }

        /**
         * Authentication successful.
         * Create refresh token...
         */
        const user = result.data!;
        const userId = (user._id as Types.ObjectId).toString();
        return createRefreshToken(userId, remember).then((refreshToken) => {
            // ...and add it to the client cookies
            createRefreshCookie(response, refreshToken, remember);
            createLoggedCookie(response, remember);

            /**
             * Send the newly created access token to the client through the response.
             * It will be used for the following requests.
             */
            return createAccessToken(refreshToken).then((accessToken) => {
                successResponse(response, { token: accessToken }, 200, 'Authentication successful');
            });
        });
    }).finally(runTokenCleanup);
};

export default postLogin;
