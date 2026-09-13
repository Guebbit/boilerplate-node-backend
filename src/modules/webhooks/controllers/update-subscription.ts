/**
 * @module
 * Controller for `PATCH /webhooks/subscriptions/:id`.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { UpdateWebhookSubscriptionBody } from '@api/schemas.zod';
import type { UpdateWebhookSubscriptionRequest, WebhookSubscriptionCreated } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf, extractAndValidateId } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { webhooksService } from '../services';

/** Same scheme restriction as `create-subscription.ts`, only when `url` is actually sent. */
const updateWebhookSubscriptionSchema = UpdateWebhookSubscriptionBody.extend({
    url: z
        .url()
        .refine((url) => url.startsWith('https://'), 'Webhook URL must use https://')
        .optional()
});

/**
 * PATCH /webhooks/subscriptions/:id
 * Partial update, plus the two secret-ring actions (`rotateSecret`, `removeSecretId`) — see
 * `openapi.yaml`'s description for how a rotation's overlap works.
 */
export const updateWebhookSubscription = (
    request: Request<{ id: string }, unknown, UpdateWebhookSubscriptionRequest>,
    response: Response
) => {
    const id = extractAndValidateId(request, response);
    if (!id) return;

    const body = parseBody(updateWebhookSubscriptionSchema, request.body, response);
    if (!body) return;

    return webhooksService
        .updateSubscription(id, body, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            if (!result.data)
                throw new Error('webhook subscription update succeeded without a result');
            return successResponse<WebhookSubscriptionCreated>(response, {
                ...(result.data.subscription.toJSON() as WebhookSubscriptionCreated),
                newSecret: result.data.newSecret
            });
        })
        .catch(catchAs(response, 'updateWebhookSubscription'));
};
