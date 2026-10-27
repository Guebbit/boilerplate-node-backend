/**
 * @module
 * Controller for `DELETE /webhooks/subscriptions/:id/secrets/:secretId`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { WebhookSubscription } from '@types';
import { webhooksService } from '../services';
import { viewSubscription } from '../services/actions';

/**
 * DELETE /webhooks/subscriptions/:id/secrets/:secretId
 * Drops one ring entry — the other half of a rotation, once every consumer has switched. 404s an
 * id the ring doesn't carry; 422s a removal that would leave the ring empty (a subscription with
 * no secret can never sign a delivery).
 */
export const removeWebhookSubscriptionSecret = (
    request: Request<{ id: string; secretId: string }>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return;

    const context = tenantCallerContextOf(request);
    return webhooksService
        .removeSubscriptionSecret(id, request.params.secretId, context)
        .then((result) => {
            if (refused(response, result)) return;
            return successResponse<WebhookSubscription>(
                response,
                viewSubscription(result.data, context.caller)
            );
        })
        .catch(catchAs(response, 'removeWebhookSubscriptionSecret'));
};
