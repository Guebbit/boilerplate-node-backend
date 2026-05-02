import type { Request, Response } from 'express';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import type { SignupRequest, SignupRequestMultipart } from '@types';
import type { CastError } from 'mongoose';
import { databaseErrorInterpreter } from '@utils/helpers-errors';

/**
 * POST /account/signup
 * Register a new user account.
 */
export const postSignup = (
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
    const { imageUrlRaw, imageUrl: imageUrlFile } = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? request.body.imageUrl ?? '';
    // If problem arises: remove the uploaded file (that can be missing so nothing happen)
    const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve(true));

    /**
     * Register
     */
    return userService
        .signup(email, username, password, passwordConfirm, imageUrl ?? request.body.imageUrl)
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    rejectResponse(response, result.status, result.message, result.errors);
                });

            // Registration successful
            successResponse(response, result.data, 201);
        })
        .catch((error: CastError | Error) => {
            const [status, message] = databaseErrorInterpreter(error);
            rejectResponse(response, status, message);
            return deleteUpload();
        });
};
