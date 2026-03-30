import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * POST body data
 */
export interface IPostSignupPostData {
    email: string,
    username: string,
    password: string,
    passwordConfirm: string,
    imageUrl?: string,
}

/**
 * POST /account/signup
 * Register a new user account.
 */
const postSignup = async (request: Request, response: Response): Promise<void> => {
    /**
     * Get POST data
     */
    const { email, username, password, passwordConfirm, imageUrl } = request.body as IPostSignupPostData;

    /**
     * Register
     */
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

    // Registration successful
    successResponse(response, result.data, 201);
};

export default postSignup;
