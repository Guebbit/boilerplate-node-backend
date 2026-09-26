/**
 * @module
 * Controller for `DELETE /webhooks/subscriptions/:id/secrets/:secretId`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf, extractAndValidateId } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { WebhookSubscriptionCreated } from '@types';
import { webhooksService } from '../services';

/**
 * DELETE /webhooks/subscriptions/:id/secrets/:secretId
 * Drops one ring entry — the other half of a rotation, once every consumer has switched. 422s if
 * it would leave the ring empty; a subscription with no secret can never sign a delivery.
 */
export const removeWebhookSubscriptionSecret = (
    request: Request<{ id: string; secretId: string }>,
    response: Response
) => {
    const id = extractAndValidateId(request, response, 'path');
    if (!id) return;

    return webhooksService
        .removeSubscriptionSecret(id, request.params.secretId, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return successResponse<WebhookSubscriptionCreated>(
                response,
                result.data.subscription.toJSON() as WebhookSubscriptionCreated
            );
        })
        .catch(catchAs(response, 'removeWebhookSubscriptionSecret'));
};
