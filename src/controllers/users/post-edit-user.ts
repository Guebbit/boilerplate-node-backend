import type { NextFunction, Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { Types } from 'mongoose';
import { deleteFile } from '@utils/helpers-filesystem';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { ExtendedError } from '@utils/helpers-errors';
import UserService from '@services/users';

/**
 * Body shape for the user create/edit form
 */
export interface IPostEditUserBody {
    id?: string;
    email: string;
    username: string;
    password?: string;
    admin?: string; // checkbox: "on" or undefined
    imageUrl?: string;
}

/**
 * Create or update a user (admin only).
 * Handles data validation and redirects.
 *
 * @param request
 * @param response
 * @param next
 */
export const postEditUser = async (
    request: Request<unknown, unknown, IPostEditUserBody>,
    response: Response,
    next: NextFunction
) => {
    const { id, email, username } = request.body;

    // Checkbox values arrive as "on" (checked) or undefined (unchecked)
    const admin = request.body.admin === 'on';
    // Password is optional when editing; required when creating
    const password = request.body.password ?? '';
    const isNew = !id || id === '';

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const imageUrlBody = request.body.imageUrl;
    const { imageUrlRaw, imageUrl: imageUrlFile } = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? imageUrlBody ?? '';

    /**
     * Data validation
     */
    const issues = UserService.validateData(
        { email, username, password: password || undefined, admin, imageUrl },
        { requirePassword: isNew }
    );

    /**
     * Validation error
     */
    if (issues.length > 0) {
        request.flash('error', issues);
        request.flash('filled', [email, username, String(admin), imageUrl]);
        if (imageUrlRaw) void deleteFile(imageUrlRaw);
        if (isNew) return response.redirect('/users/add');
        return response.redirect('/users/edit/' + id);
    }

    /**
     * NO ID = new user
     */
    if (isNew)
        return UserService.adminCreate({
            email,
            username,
            password,
            admin,
            imageUrl: imageUrl || undefined
        })
            .then(() => response.redirect('/users/'))
            .catch(async (error: CastError) => {
                if (imageUrlRaw) void deleteFile(imageUrlRaw);
                return next(new ExtendedError(error.kind, 500, false, [error.message]));
            });

    /**
     * ID = edit user
     */
    return UserService.adminUpdate(id, {
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
            if (imageUrlRaw) void deleteFile(imageUrlRaw);
            return next(new ExtendedError(error.kind, 500, false, [error.message]));
        });
};
