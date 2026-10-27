/**
 * @module
 * Controller for `GET /webhooks/deliveries/:id`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { WebhookDelivery } from '@types';
import { webhooksService } from '../services';

/**
 * GET /webhooks/deliveries/:id
 * One delivery of this tenant's log. A miss, a malformed id and another shop's delivery all answer 404.
 */
export const getWebhookDelivery = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return;

    return webhooksService
        .getDelivery(id, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return successResponse<WebhookDelivery>(response, result.data);
        })
        .catch(catchAs(response, 'getWebhookDelivery'));
};
