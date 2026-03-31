import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { UpdateUserRequest } from '@types';

/**
 * PUT /users
 * Update a user by id in the request body (admin).
 */
const putUsers = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateUserRequest;
    if (!body.id) {
        rejectResponse(response, 422, 'updateUser - missing id', [t('generic.error-missing-data')]);
        return;
    }

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request);

    try {
        const user = await UserService.adminUpdate(body.id, { ...body, ...(imageUrl !== undefined && { imageUrl }) });
        successResponse(response, user.toObject());
    } catch (error) {
        if (imageUrlRaw)
            await deleteFile(imageUrlRaw);
        const message = (error as Error).message;
        if (message === '404')
            rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
        else
            rejectResponse(response, 500, 'Internal Server Error', [message]);
    }
};

export default putUsers;
