/**
 * @module
 * `GET /notifications/:id` controller — thin HTTP adapter over `notificationsService.get`.
 */

import type { Request, Response } from 'express';
import type { Notification } from '@types';
import { requireId } from '@infrastructure/http/ids';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import { notificationsService } from '../services';

/**
 * GET /notifications/:id
 * One of the caller's own notifications. An id that is someone else's answers the same 404 as one
 * that does not exist.
 */
export const getNotification = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'notifications.not-found' });
    if (!id) return;

    return notificationsService
        .get(request.caller!, id)
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<Notification>(response, result.data, 200);
        })
        .catch(catchAs(response, 'getNotificationById'));
};
