/**
 * @module
 * Controller for `POST /webhooks/subscriptions/:id/rotate-secret`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { WebhookSubscriptionCreated } from '@types';
import { webhooksService } from '../services';
import { presentWebhookSubscription } from '../presenters';

/**
 * POST /webhooks/subscriptions/:id/rotate-secret
 * Mints a new ring secret and returns its plaintext once, in `newSecret` — the old secret stays
 * active until `DELETE .../secrets/:secretId` drops it.
 */
export const rotateWebhookSubscriptionSecret = (
    request: Request<{ id: string }>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'generic.error-not-found' });
    if (!id) return;

    return webhooksService
        .rotateSubscriptionSecret(id, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return successResponse<WebhookSubscriptionCreated>(response, {
                ...presentWebhookSubscription(result.data.subscription),
                newSecret: result.data.newSecret
            });
        })
        .catch(catchAs(response, 'rotateWebhookSubscriptionSecret'));
};
