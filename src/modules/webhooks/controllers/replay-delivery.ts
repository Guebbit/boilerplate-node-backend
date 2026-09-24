/**
 * @module
 * Controller for `POST /webhooks/deliveries/:id/replay` — the single most-requested support
 * action, per `docs/modules/webhooks.md`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf, extractAndValidateId } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { WebhookDelivery } from '@types';
import { webhooksService } from '../services';

/**
 * POST /webhooks/deliveries/:id/replay
 * Re-sends the delivery synchronously, against the subscription's current url and secret ring.
 */
export const replayWebhookDelivery = (request: Request<{ id: string }>, response: Response) => {
    // 'path': this route carries no body — params-only, unlike `write`'s params-then-body.
    // Already validated as a well-formed ObjectId here, so `replayDelivery` below can never
    // raise the CastError a malformed one would — no not-found mapping needed on its catch.
    const id = extractAndValidateId(request, response, 'path');
    if (!id) return;

    return webhooksService
        .replayDelivery(id, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return successResponse<WebhookDelivery>(
                response,
                result.data.toJSON() as WebhookDelivery
            );
        })
        .catch(catchAs(response, 'replayWebhookDelivery'));
};
