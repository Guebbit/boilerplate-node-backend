/**
 * @module
 * `DELETE /notifications` controller — thin HTTP adapter over `notificationsService.dismissAll`.
 */

import type { Request, Response } from 'express';
import { noContentResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { notificationsService } from '../services';

/**
 * DELETE /notifications
 * Delete every notification of the caller.
 */
export const deleteNotifications = (request: Request, response: Response) => {
    return notificationsService
        .dismissAll(request.authContext!.id)
        .then(() => {
            noContentResponse(response);
        })
        .catch(catchAs(response, 'dismissAllNotifications'));
};
