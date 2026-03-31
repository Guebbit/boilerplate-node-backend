import type { Request, Response, } from 'express';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { SignupRequest, SignupRequestMultipart } from '@types';

/**
 * POST /account/signup
 * Register a new user account.
 */
const postSignup = async (request: Request<unknown, unknown, SignupRequest | SignupRequestMultipart>, response: Response): Promise<void> => {
    /**
     * Get POST data
     */
    const { email, username, password, passwordConfirm } = request.body;
    const imageUrlBody = request.body.imageUrl

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    /**
     * Register
     */
    const result = await UserService.signup(
        email ?? '',
        username ?? '',
        password ?? '',
        passwordConfirm ?? '',
        imageUrl ?? imageUrlBody,
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
