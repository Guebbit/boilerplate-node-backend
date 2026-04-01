import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import type { CreateUserRequest, CreateUserRequestMultipart } from '@types';

/**
 * POST /users
 * Create a new user (admin).
 */
const postUsers = (
    request: Request<unknown, unknown, CreateUserRequest | CreateUserRequestMultipart>,
    response: Response
) => {
    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    const errors = UserService.validateData({
        ...request.body,
        imageUrl: imageUrl ?? request.body.imageUrl
    });

    if (errors.length > 0)
        return (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve()).then(() => {
            rejectResponse(response, 422, 'createUser - validation failed', errors);
        });

    return UserService.adminCreate({
        ...request.body,
        imageUrl: imageUrl ?? request.body.imageUrl
    })
        .then((user) => {
            successResponse(response, user.toObject(), 201);
        })
        .catch((error: Error) =>
            (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve()).then(() => {
                rejectResponse(response, 500, 'Internal Server Error', [error.message]);
            })
        );
};

export default postUsers;
