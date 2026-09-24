/**
 * @module
 * Controller for `PATCH /webhooks/subscriptions/:id`.
 */

import type { Request, Response } from 'express';
import { UpdateWebhookSubscriptionBody } from '@api/schemas.zod';
import type { UpdateWebhookSubscriptionRequest, WebhookSubscriptionCreated } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf, extractAndValidateId } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { webhooksService } from '../services';

/**
 * PATCH /webhooks/subscriptions/:id
 * Partial update, plus the two secret-ring actions (`rotateSecret`, `removeSecretId`) — see
 * `openapi.yaml`'s description for how a rotation's overlap works. Same `https://` scheme
 * restriction as `create-subscription.ts`, enforced by the generated schema's own `pattern`,
 * only when `url` is actually sent.
 */
export const updateWebhookSubscription = (
    request: Request<{ id: string }, unknown, UpdateWebhookSubscriptionRequest>,
    response: Response
) => {
    const id = extractAndValidateId(request, response);
    if (!id) return;

    const body = parseBody(UpdateWebhookSubscriptionBody, request.body, response);
    if (!body) return;

    return webhooksService
        .updateSubscription(id, body, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return successResponse<WebhookSubscriptionCreated>(response, {
                ...(result.data.subscription.toJSON() as WebhookSubscriptionCreated),
                newSecret: result.data.newSecret
            });
        })
        .catch(catchAs(response, 'updateWebhookSubscription'));
};
