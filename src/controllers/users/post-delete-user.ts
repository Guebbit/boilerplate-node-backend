import type { CastError } from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import { t } from 'i18next';
import { databaseErrorConverter, ExtendedError } from '@utils/helpers-errors';
import type { DeleteUserRequest } from '@types';
import { userService } from '@services/users';

/**
 * Delete a user (admin only)
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteUser = (
    request: Request<{ id?: string; hardDelete?: boolean }, unknown, DeleteUserRequest>,
    response: Response,
    next: NextFunction
) => {
    const id = request.params.id ?? request.body.id;
    const hardDelete = !!(request.params.hardDelete ?? request.body.hardDelete);

    if (!id) return next(new ExtendedError('404', 404, false, [t('admin.user-not-found')]));

    return userService.remove(id, hardDelete)
        .then(({ success, message }) => {
            if (success) request.flash('success', [message]);
            response.redirect('/users/');
        })
        .catch((error: CastError) => {
            if (error.message == '404' || error.kind === 'ObjectId')
                return next(new ExtendedError('404', 404, false, [t('admin.user-not-found')]));
            return next(databaseErrorConverter(error));
        });
};
