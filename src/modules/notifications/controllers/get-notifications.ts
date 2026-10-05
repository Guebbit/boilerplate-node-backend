/**
 * @module
 * `GET /notifications` controller — thin HTTP adapter over `notificationsService.notificationsList`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import type { NotificationsResponse } from '@types';
import { notificationsService } from '../services';

/**
 * GET /notifications
 * The authenticated user's own inbox, newest first.
 */
export const getNotifications = (request: Request, response: Response) => {
    return notificationsService
        .notificationsList(request.authContext!.id)
        .then((view) => {
            successResponse<NotificationsResponse>(response, view);
        })
        .catch(catchAs(response, 'listNotifications'));
};
