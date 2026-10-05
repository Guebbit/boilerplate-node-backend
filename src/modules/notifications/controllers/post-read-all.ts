/**
 * @module
 * `POST /notifications/read-all` controller — thin HTTP adapter over `notificationsService.notificationsReadAll`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { notificationsService } from '../services';

/**
 * POST /notifications/read-all
 * Mark every unread notification of the caller read.
 */
export const postReadAll = (request: Request, response: Response) => {
    return notificationsService
        .notificationsReadAll(request.authContext!.id)
        .then((result) => {
            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'readAllNotifications'));
};
