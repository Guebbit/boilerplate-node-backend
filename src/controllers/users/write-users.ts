import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import type {
    CreateUserRequest,
    CreateUserRequestMultipart,
    UpdateUserRequest,
    UpdateUserRequestMultipart,
    UpdateUserByIdRequest,
    UpdateUserByIdRequestMultipart
} from '@types';

/**
 * POST /users — create a new user (admin).
 * PUT /users — update a user by id in the request body (admin).
 * PUT /users/:id — update a user by path id (admin).
 *
 * Behaviour: if an id is found (path param or body), the user is updated;
 * otherwise a new user is created (POST only — PUT without id returns 422).
 */
export const writeUsers = (
    request: Request<
        { id?: string },
        unknown,
        | CreateUserRequest
        | CreateUserRequestMultipart
        | UpdateUserRequest
        | UpdateUserRequestMultipart
        | UpdateUserByIdRequest
        | UpdateUserByIdRequestMultipart
    >,
    response: Response
) => {
    const id = request.params.id ?? (request.body as { id?: string }).id;

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl: imageUrlFile } = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? request.body.imageUrl ?? '';
    // If problem arises: remove the uploaded file (that can be missing so nothing happen)
    const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve(true));

    if (!id) {
        // PUT without an id is invalid
        if (request.method === 'PUT') {
            rejectResponse(response, 422, 'updateUser - missing id', [
                t('generic.error-missing-data')
            ]);
            return deleteUpload();
        }

        // POST: create
        const errors = userService.validateData({
            ...request.body,
            imageUrl: imageUrl ?? request.body.imageUrl
        });
        if (errors.length > 0)
            return deleteUpload().then(() => {
                rejectResponse(response, 422, 'createUser - validation failed', errors);
            });

        return userService
            .adminCreate({ ...request.body, imageUrl })
            .then((user) => {
                successResponse(response, user.toObject(), 201);
            })
            .catch((error: Error) =>
                deleteUpload().then(() => {
                    rejectResponse(response, 500, 'Internal Server Error', [error.message]);
                })
            );
    }

    // PUT or POST with id: update
    return userService
        .adminUpdate(id, { ...request.body, imageUrl: imageUrl ?? request.body.imageUrl })
        .then((user) => {
            successResponse(response, user.toObject());
        })
        .catch((error: Error) =>
            deleteUpload().then(() => {
                if (error.message === '404')
                    rejectResponse(response, 404, 'Not Found', [t('admin.user-not-found')]);
                else rejectResponse(response, 500, 'Internal Server Error', [error.message]);
            })
        );
};
