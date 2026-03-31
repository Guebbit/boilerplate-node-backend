import type { Request, Response, ParamsDictionary } from 'express';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { SignupRequest } from '../../../api/api';

/**
 * POST /account/signup
 * Register a new user account.
 */
const postSignup = async (request: Request<ParamsDictionary, any, SignupRequest & { imageUrl?: string }>, response: Response): Promise<void> => {
    /**
     * Get POST data
     */
    const { email, username, password, passwordConfirm, imageUrl } = request.body;

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
        if (imageUrlRaw)
            await deleteFile(imageUrlRaw);
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }

    // Registration successful
    successResponse(response, result.data, 201);
};

export default postSignup;
