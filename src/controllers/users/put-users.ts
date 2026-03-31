import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { UpdateUserRequest, UpdateUserRequestMultipart } from '@types';

/**
 * PUT /users
 * Update a user by id in the request body (admin).
 */
const putUsers = (request: Request<unknown, unknown, UpdateUserRequest | UpdateUserRequestMultipart>, response: Response): Promise<void> => {
    if (!request.body.id) {
        rejectResponse(response, 422, 'updateUser - missing id', [t('generic.error-missing-data')]);
        return Promise.resolve();
    }

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    return UserService.adminUpdate(request.body.id, {
        ...request.body,
        ...(imageUrl !== undefined && { imageUrl })
    })
        .then((user) => successResponse(response, user.toObject()))
        .catch((error) => {
            const deleteP = imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve();
            return deleteP.then(() => {
                const message = (error as Error).message;
                if (message === '404')
                    rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
                else rejectResponse(response, 500, 'Internal Server Error', [message]);
            });
        });
};

export default putUsers;
