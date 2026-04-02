import type { Request, Response } from 'express';
import { userService } from '@services/users';
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

export const postLogin = (
    request: Request<unknown, unknown, LoginRequest & { remember?: ERefreshTokenExpiryTime }>,
    response: Response
) => {
    const { email, password, remember } = request.body;

    return runTokenCleanup()
        .then(() => userService.login(email, password))
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }

            const user = result.data!;
            const userId = String(user.id);
            return createRefreshToken(userId, remember)
                .then((refreshToken) => {
                    createRefreshCookie(response, refreshToken, remember);
                    createLoggedCookie(response, remember);

                    return createAccessToken(refreshToken);
                })
                .then((accessToken) => {
                    successResponse(
                        response,
                        { token: accessToken },
                        200,
                        'Authentication successful'
                    );
                });
        });
};
