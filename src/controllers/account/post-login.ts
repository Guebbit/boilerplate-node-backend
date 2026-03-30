import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import UserService from '@services/users';
import {
    createRefreshToken,
    createRefreshCookie,
    createLoggedCookie,
    createAccessToken,
} from '@middlewares/auth-jwt';
import { rejectResponse, successResponse } from '@utils/response';

/**
 * POST /account/login
 * Authenticates a user and returns JWT access token + sets refresh cookie.
 */
const login = async (request: Request, response: Response): Promise<void> => {
    const { email, password } = request.body as { email?: string; password?: string };
    const result = await UserService.login(email, password);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    const user = result.data!;
    const userId = (user._id as Types.ObjectId).toString();
    const refreshToken = await createRefreshToken(userId);
    createRefreshCookie(response, refreshToken);
    createLoggedCookie(response);
    const accessToken = await createAccessToken(refreshToken);
    successResponse(response, { token: accessToken });
};

export default login;
