/**
 * @module
 * `DELETE /notifications` controller — thin HTTP adapter over `notificationsService.dismissAll`.
 */

import type { Request, Response } from 'express';
import { noContentResponse } from '@infrastructure/http/response';
import { catchAs, parseBody } from '@infrastructure/http/controller';
import { DismissAllNotificationsQueryParams } from '@api/schemas.zod';
import { notificationsService } from '../services';

/**
 * DELETE /notifications
 * Delete every notification of the caller, or only one `audience` of them.
 */
export const deleteNotifications = (request: Request, response: Response) => {
    const parsed = parseBody(DismissAllNotificationsQueryParams, request.query, response);
    if (!parsed) return;

    return notificationsService
        .dismissAll(request.authContext!.id, parsed.audience)
        .then(() => {
            noContentResponse(response);
        })
        .catch(catchAs(response, 'dismissAllNotifications'));
};
