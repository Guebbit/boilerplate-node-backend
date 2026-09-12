/**
 * @module
 * Controller for `POST /webhooks/subscriptions`.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { CreateWebhookSubscriptionBody } from '@api/schemas.zod';
import type { CreateWebhookSubscriptionRequest, WebhookSubscriptionCreated } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { webhooksService } from '../services';

/**
 * The generated schema validates `url` as a URI; the scheme restriction is this module's own rule
 * (not expressible in `format: uri`), checked here rather than left to the FIRST delivery attempt
 * to discover — see `openapi.yaml`'s own description of the field.
 */
const createWebhookSubscriptionSchema = CreateWebhookSubscriptionBody.extend({
    url: z.url().refine((url) => url.startsWith('https://'), 'Webhook URL must use https://')
});

/**
 * POST /webhooks/subscriptions
 * Create a subscription. `url` is validated as `https://` here, and re-validated — against the
 * RESOLVED IP this time — on every delivery, since a subscription's DNS can change after it is
 * created. See `@infrastructure/adapters/ssrf-guard.ts`.
 */
export const createWebhookSubscription = (
    request: Request<unknown, unknown, CreateWebhookSubscriptionRequest>,
    response: Response
) => {
    const body = parseBody(createWebhookSubscriptionSchema, request.body, response);
    if (!body) return;

    return webhooksService
        .createSubscription(body, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            // `refused` only reports the reject branch; a success result always carries the
            // created subscription.
            if (!result.data) throw new Error('webhook subscription created without a result');
            return successResponse<WebhookSubscriptionCreated>(
                response,
                {
                    ...(result.data.subscription.toJSON() as WebhookSubscriptionCreated),
                    secret: result.data.secret
                },
                201
            );
        })
        .catch(catchAs(response, 'createWebhookSubscription'));
};
