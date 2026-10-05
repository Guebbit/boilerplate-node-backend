/**
 * @module
 * `DELETE /notifications/:id` controller — thin HTTP adapter over `notificationsService.notificationDelete`.
 */

import type { Request, Response } from 'express';
import { requireId } from '@infrastructure/http/ids';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import { notificationsService } from '../services';

/**
 * DELETE /notifications/:id
 * Delete one of the caller's own notifications. An id that is someone else's answers the same 404
 * as one that does not exist.
 */
export const deleteNotification = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'notifications.not-found' });
    if (!id) return;

    return notificationsService
        .notificationDelete(request.authContext!.id, id)
        .then((result) => {
            if (refused(response, result)) return;

            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'deleteNotificationById'));
};
