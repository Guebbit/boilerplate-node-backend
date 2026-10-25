/**
 * @module
 * `POST /notifications/read-all` controller — thin HTTP adapter over `notificationsService.readAll`.
 */

import type { Request, Response } from 'express';
import { noContentResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { notificationsService } from '../services';

/**
 * POST /notifications/read-all
 * Mark every unread notification of the caller read.
 */
export const postReadAll = (request: Request, response: Response) => {
    return notificationsService
        .readAll(request.authContext!.id)
        .then(() => {
            noContentResponse(response);
        })
        .catch(catchAs(response, 'readAllNotifications'));
};
