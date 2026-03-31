import type { Request, Response, NextFunction } from 'express';
import type { CastError } from 'mongoose';
import { t } from 'i18next';
import { databaseErrorConverter, ExtendedError } from '@utils/helpers-errors';
import UserService from '@services/users';

/**
 * Url parameters
 */
export interface IGetTargetUserParameters {
    userId: string;
}

/**
 * Get (single) user page (admin only)
 *
 * @param request
 * @param response
 * @param next
 */
export const pageTargetUser = (
    request: Request & {
        params: IGetTargetUserParameters;
    },
    response: Response,
    next: NextFunction
) =>
    UserService.getById(request.params.userId)
        .then((user) => {
            if (!user)
                return next(new ExtendedError('404', 404, false, [t('admin.user-not-found')]));
            response.render('users/details', {
                pageMetaTitle: user.username,
                pageMetaLinks: [],
                user
            });
        })
        .catch((error: CastError) => {
            if (error.message == '404' || error.kind === 'ObjectId')
                return next(new ExtendedError('404', 404, false, [t('admin.user-not-found')]));
            return next(databaseErrorConverter(error));
        });
