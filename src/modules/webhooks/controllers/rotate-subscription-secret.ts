/**
 * @module
 * Controller for `POST /webhooks/subscriptions/:id/rotate-secret`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf, extractAndValidateId } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { WebhookSubscriptionCreated } from '@types';
import { webhooksService } from '../services';

/**
 * POST /webhooks/subscriptions/:id/rotate-secret
 * Mints a new ring secret and returns its plaintext once, in `newSecret` — the old secret stays
 * active until `DELETE .../secrets/:secretId` drops it.
 */
export const rotateWebhookSubscriptionSecret = (
    request: Request<{ id: string }>,
    response: Response
) => {
    const id = extractAndValidateId(request, response, 'path');
    if (!id) return;

    return webhooksService
        .rotateSubscriptionSecret(id, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return successResponse<WebhookSubscriptionCreated>(response, {
                // `.toJSON()` applies the model's `_id` → `id` transform; the document is typed as
                // stored, not as the wire shape `WebhookSubscriptionCreated` promises.
                ...(result.data.subscription.toJSON() as WebhookSubscriptionCreated),
                newSecret: result.data.newSecret
            });
        })
        .catch(catchAs(response, 'rotateWebhookSubscriptionSecret'));
};
