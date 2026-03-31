import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { UpdateUserByIdRequest } from '@types';

/**
 * PUT /users/:id
 * Update a user by path id (admin).
 */
const putUserById = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateUserByIdRequest;

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request);

    try {
        /**
         * Update user with the new data
         */
        const user = await UserService.adminUpdate(String(request.params.id), { ...body, ...(imageUrl !== undefined && { imageUrl }) });
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

export default putUserById;
