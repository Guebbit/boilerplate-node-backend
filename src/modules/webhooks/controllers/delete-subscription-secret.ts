/**
 * @module
 * Controller for `DELETE /webhooks/subscriptions/:id/secrets/:secretId`.
 */

import type { Request, Response } from 'express';
import { noContentResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import { webhooksService } from '../services';

/**
 * DELETE /webhooks/subscriptions/:id/secrets/:secretId
 * Drops one ring entry — the other half of a rotation, once every consumer has switched. 404s an
 * id the ring doesn't carry; 422s a removal that would leave the ring empty (a subscription with
 * no secret can never sign a delivery). Answers 204: the ring is one read of the subscription away.
 */
export const deleteWebhookSubscriptionSecret = (
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
            noContentResponse(response);
        })
        .catch(catchAs(response, 'deleteWebhookSubscriptionSecret'));
};
