import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { userService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
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
                rejectResponse(response, 404, [t('users.not-found')]);
                return;
            }
            successResponse(response, user);
        })
        .catch((error: CastError) => {
            if (error.kind === 'ObjectId')
                return rejectResponse(response, 404, [t('users.not-found')]);
            rejectDatabaseError(response, 'getUserItem', error);
        });
