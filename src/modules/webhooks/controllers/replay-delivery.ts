/**
 * @module
 * Controller for `POST /webhooks/deliveries/:id/replay` — the single most-requested support
 * action, per `docs/modules/webhooks.md`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { WebhookDelivery } from '@types';
import { webhooksService } from '../services';
import { presentWebhookDelivery } from '../presenters';

/**
 * POST /webhooks/deliveries/:id/replay
 * Re-sends the delivery synchronously, against the subscription's current url and secret ring.
 */
export const replayWebhookDelivery = (request: Request<{ id: string }>, response: Response) => {
    // A malformed id answers as an unknown one, before the database is asked.
    const id = requireId(request, response, { notFound: 'generic.error-not-found' });
    if (!id) return;

    return webhooksService
        .replayDelivery(id, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return successResponse<WebhookDelivery>(response, presentWebhookDelivery(result.data));
        })
        .catch(catchAs(response, 'replayWebhookDelivery'));
};
