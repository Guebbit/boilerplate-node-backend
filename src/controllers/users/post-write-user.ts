import type { NextFunction, Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { Types } from 'mongoose';
import { deleteFile } from '@utils/helpers-filesystem';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { ExtendedError } from '@utils/helpers-errors';
import type { CreateUserRequestMultipart, UpdateUserRequestMultipart } from '@types';
import { userService } from '@services/users';

/**
 * Create or update a user (admin only).
 * Handles data validation and redirects.
 *
 * @param request
 * @param response
 * @param next
 */
export const postWriteUser = async (
    request: Request<unknown, unknown, CreateUserRequestMultipart | UpdateUserRequestMultipart>,
    response: Response,
    next: NextFunction
) => {
    const body = request.body;

    // 'id' is only present in UpdateUserRequestMultipart (edit path)
    const id = ('id' in body ? (body as UpdateUserRequestMultipart).id : undefined) as
        | string
        | undefined;
    const { email = '', password = '' } = body;
    // 'username' is only present in CreateUserRequestMultipart (create path)
    const username = (
        'username' in body ? (body as CreateUserRequestMultipart).username : ''
    ) as string;

    // Checkbox values arrive as "on" (checked) or undefined (unchecked);
    // 'admin' is only present in CreateUserRequestMultipart
    const admin = !!(body as { admin?: unknown }).admin;
    // Password is optional when editing; required when creating
    const isNew = !id || id === '';

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl: imageUrlFile } = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? request.body.imageUrl ?? '';
    // If problem arises: remove the uploaded file (that can be missing so nothing happen)
    const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve(true));

    /**
     * Data validation
     */
    const issues = userService.validateData(
        { email, username, password: password || undefined, admin, imageUrl },
        { requirePassword: isNew }
    );

    /**
     * Validation error
     */
    if (issues.length > 0) {
        request.flash('error', issues);
        request.flash('filled', [email, username, String(admin), imageUrl]);
        void deleteUpload();
        if (isNew) return response.redirect('/users/add');
        return response.redirect('/users/edit/' + id);
    }

    /**
     * NO ID = new user
     */
    if (isNew)
        return userService.adminCreate({
            email,
            username,
            password,
            admin,
            imageUrl: imageUrl || undefined
        })
            .then(() => response.redirect('/users/'))
            .catch(async (error: CastError) => {
                void deleteUpload();
                return next(new ExtendedError(error.kind, 500, false, [error.message]));
            });

    /**
     * ID = edit user
     */
    return userService.adminUpdate(id, {
        email,
        username,
        // Only send password if the field was filled
        password: password.trim().length > 0 ? password : undefined,
        admin,
        imageUrl: imageUrl || undefined
    })
        .then((updatedUser) =>
            response.redirect('/users/details/' + (updatedUser._id as Types.ObjectId).toString())
        )
        .catch(async (error: CastError) => {
            void deleteUpload();
            return next(new ExtendedError(error.kind, 500, false, [error.message]));
        });
};
