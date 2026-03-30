import type { Request, Response } from 'express';
import UserService from '@services/users';
import { rejectResponse, successResponse } from '@utils/response';

/**
 * POST /account/signup
 * Registers a new user account.
 */
const signup = async (request: Request, response: Response): Promise<void> => {
    const { email, username, password, passwordConfirm, imageUrl } = request.body as Record<string, string | undefined>;
    const result = await UserService.signup(
        email ?? '',
        username ?? '',
        password ?? '',
        passwordConfirm ?? '',
        imageUrl,
    );
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, result.data, 201);
};

export default signup;
