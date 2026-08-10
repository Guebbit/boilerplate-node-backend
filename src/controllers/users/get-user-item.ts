import type { Request, Response } from 'express';
import { t } from '@core/i18n';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@core/http/response';
import { rejectDatabaseError } from '@core/http/errors';
import type { CastError } from 'mongoose';

/**
 * GET /users/:id
 * Get a single user by path id (admin).
 */
export const getUserItem = (request: Request, response: Response) =>
    userService
        .getById(String(request.params.id))
        .then((user) => {
            if (!user) {
                rejectResponse(response, 404, [t('ecommerce.user-not-found')]);
                return;
            }
            successResponse(response, user);
        })
        .catch((error: CastError) => {
            if (error.kind === 'ObjectId')
                return rejectResponse(response, 404, [t('ecommerce.user-not-found')]);
            rejectDatabaseError(response, 'getUserItem', error);
        });
