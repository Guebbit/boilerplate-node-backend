/**
 * @module
 * Controller for `POST /webhooks/subscriptions`.
 */

import type { Request, Response } from 'express';
import { CreateWebhookSubscriptionBody } from '@api/schemas.zod';
import type { CreateWebhookSubscriptionRequest, WebhookSubscriptionCreated } from '@types';
import { createdResponse } from '@infrastructure/http/response';
import { answerAsResource } from '@infrastructure/http/preconditions';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { webhooksService } from '../services';
import { viewSubscription } from '../services/actions';

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

    const context = tenantCallerContextOf(request);
    return webhooksService
        .createSubscription(body, context)
        .then((result) => {
            if (refused(response, result)) return;
            const subscription = viewSubscription(result.data.subscription, context.caller);
            const location = `/webhooks/subscriptions/${subscription.id}`;
            /**
             * The new subscription's real tag (the body also carries the one-time secret), and
             * the resource it belongs to (RFC 9110 §8.8.3).
             */
            answerAsResource(response, subscription, location);
            return createdResponse<WebhookSubscriptionCreated>(
                response,
                { ...subscription, secret: result.data.secret },
                location
            );
        })
        .catch(catchAs(response, 'createWebhookSubscription'));
};
