import type { Request, Response } from 'express';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import type { SignupRequest, SignupRequestMultipart } from '@types';
import { databaseErrorInterpreter } from '@utils/helpers-errors';

export const postSignup = (
    request: Request<unknown, unknown, SignupRequest | SignupRequestMultipart>,
    response: Response
) => {
    const { email, username, password, passwordConfirm } = request.body;

    const { imageUrlRaw, imageUrl: imageUrlFile } = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? request.body.imageUrl ?? '';
    const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve(true));

    return userService
        .signup(email, username, password, passwordConfirm, imageUrl ?? request.body.imageUrl)
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    rejectResponse(response, result.status, result.message, result.errors);
                });

            successResponse(response, result.data, 201);
        })
        .catch((error: Error) => {
            const [status, message] = databaseErrorInterpreter(error);
            rejectResponse(response, status, message);
            return deleteUpload();
        });
};
