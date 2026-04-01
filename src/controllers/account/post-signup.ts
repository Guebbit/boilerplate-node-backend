import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import type { SignupRequest, SignupRequestMultipart } from '@types';

/**
 * POST /account/signup
 * Register a new user account.
 */
const postSignup = (
    request: Request<unknown, unknown, SignupRequest | SignupRequestMultipart>,
    response: Response
) => {
    /**
     * Get POST data
     */
    const { email, username, password, passwordConfirm } = request.body;

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    /**
     * Register
     */
    return UserService.signup(
        email,
        username,
        password,
        passwordConfirm,
        imageUrl ?? request.body.imageUrl
    ).then((result) => {
        if (!result.success)
            return (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve()).then(() => {
                rejectResponse(response, result.status, result.message, result.errors);
            });

        // Registration successful
        successResponse(response, result.data, 201);
    });
};

export default postSignup;
