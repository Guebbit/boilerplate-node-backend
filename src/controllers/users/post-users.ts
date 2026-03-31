import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { CreateUserRequest } from '../../../api/api';

/**
 * POST /users
 * Create a new user (admin).
 */
const postUsers = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as CreateUserRequest;

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request);

    const errors = UserService.validateData(body, { requirePassword: true });
    if (errors.length > 0) {
        if (imageUrlRaw)
            await deleteFile(imageUrlRaw);
        rejectResponse(response, 422, 'createUser - validation failed', errors);
        return;
    }
    try {
        const user = await UserService.adminCreate({ ...body, ...(imageUrl !== undefined && { imageUrl }) });
        successResponse(response, user.toObject(), 201);
    } catch (error) {
        if (imageUrlRaw)
            await deleteFile(imageUrlRaw);
        rejectResponse(response, 500, 'Internal Server Error', [(error as Error).message]);
    }
};

export default postUsers;
