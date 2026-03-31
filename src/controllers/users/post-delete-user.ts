import type { CastError } from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import { t } from 'i18next';
import { databaseErrorConverter, ExtendedError } from '@utils/helpers-errors';
import type { DeleteUserRequest } from '@api/api';
import UserService from '@services/users';

/**
 * Delete a user (admin only)
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteUser = (
    request: Request<unknown, unknown, DeleteUserRequest>,
    response: Response,
    next: NextFunction
) =>
    UserService.remove(request.body.id, !!request.body.hardDelete)
        .then(({ success, message }) => {
            if (success) request.flash('success', [message]);
            response.redirect('/users/');
        })
        .catch((error: CastError) => {
            if (error.message == '404' || error.kind === 'ObjectId')
                return next(new ExtendedError('404', 404, false, [t('admin.user-not-found')]));
            return next(databaseErrorConverter(error));
        });
