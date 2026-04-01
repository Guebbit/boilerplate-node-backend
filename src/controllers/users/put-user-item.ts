import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService as UserService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import type { UpdateUserByIdRequest, UpdateUserByIdRequestMultipart } from '@types';

/**
 * PUT /users/:id
 * Update a user by path id (admin).
 */
export const putUserItem = (
    request: Request<
        { id?: string },
        unknown,
        UpdateUserByIdRequest | UpdateUserByIdRequestMultipart
    >,
    response: Response
) => {
    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    return UserService.adminUpdate(String(request.params.id), {
        ...request.body,
        imageUrl: imageUrl ?? request.body.imageUrl
    })
        .then((user) => {
            successResponse(response, user.toObject());
        })
        .catch((error: Error) =>
            (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve()).then(() => {
                if (error.message === '404')
                    rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
                else rejectResponse(response, 500, 'Internal Server Error', [error.message]);
            })
        );
};

