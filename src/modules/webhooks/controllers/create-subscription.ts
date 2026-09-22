/**
 * @module
 * Controller for `POST /webhooks/subscriptions`.
 */

import type { Request, Response } from 'express';
import { CreateWebhookSubscriptionBody } from '@api/schemas.zod';
import type { CreateWebhookSubscriptionRequest, WebhookSubscriptionCreated } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { webhooksService } from '../services';

/**
 * POST /webhooks/subscriptions
 * Create a subscription. `url` is validated as `https://` by the generated schema's own
 * `pattern` (see `openapi.yaml`), and re-validated — against the RESOLVED IP this time — on every
 * delivery, since a subscription's DNS can change after it is created. See
 * `@infrastructure/adapters/ssrf-guard.ts`.
 */
export const createWebhookSubscription = (
    request: Request<unknown, unknown, CreateWebhookSubscriptionRequest>,
    response: Response
) => {
    const body = parseBody(CreateWebhookSubscriptionBody, request.body, response);
    if (!body) return;

    return webhooksService
        .createSubscription(body, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
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
