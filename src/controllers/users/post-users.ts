import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { CreateUserRequest, CreateUserRequestMultipart } from '@types';

/**
 * POST /users
 * Create a new user (admin).
 */
const postUsers = async (request: Request<unknown, unknown, CreateUserRequest | CreateUserRequestMultipart>, response: Response): Promise<void> => {
    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    const errors = UserService.validateData({
        ...request.body,
        imageUrl: imageUrl ?? request.body.imageUrl
    });

    if (errors.length > 0) {
        if (imageUrlRaw) await deleteFile(imageUrlRaw);
        rejectResponse(response, 422, 'createUser - validation failed', errors);
        return;
    }
    try {
        const user = await UserService.adminCreate({
            ...request.body,
            imageUrl: imageUrl ?? request.body.imageUrl
        });
        successResponse(response, user.toObject(), 201);
    } catch (error) {
        if (imageUrlRaw) await deleteFile(imageUrlRaw);
        rejectResponse(response, 500, 'Internal Server Error', [(error as Error).message]);
    }
};

export default postUsers;
