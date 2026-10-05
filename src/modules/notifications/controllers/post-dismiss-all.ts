/**
 * @module
 * `POST /notifications/dismiss-all` controller — thin HTTP adapter over `notificationsService.notificationsDismissAll`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { notificationsService } from '../services';

/**
 * POST /notifications/dismiss-all
 * Delete every notification of the caller.
 */
export const postDismissAll = (request: Request, response: Response) => {
    return notificationsService
        .notificationsDismissAll(request.authContext!.id)
        .then((result) => {
            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'dismissAllNotifications'));
};
