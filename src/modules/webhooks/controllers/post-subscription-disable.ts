/**
 * @module
 * Controller for `POST /webhooks/subscriptions/:id/disable`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { answerAsResource } from '@infrastructure/http/preconditions';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { WebhookSubscription } from '@types';
import { webhooksService } from '../services';
import { viewSubscription } from '../services/actions';

/**
 * POST /webhooks/subscriptions/:id/disable
 * Pauses a subscription by hand; 409 when it already is paused.
 */
export const disableWebhookSubscription = (
    request: Request<{ id: string }>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return;

    const context = tenantCallerContextOf(request);
    return webhooksService
        .disableSubscription(id, context)
        .then((result) => {
            if (refused(response, result)) return;
            const subscription = viewSubscription(result.data, context.caller);
            // The subscription's new tag, and the resource it belongs to (RFC 9110 §8.8.3).
            answerAsResource(response, subscription, `/webhooks/subscriptions/${id}`);
            return successResponse<WebhookSubscription>(response, subscription);
        })
        .catch(catchAs(response, 'disableWebhookSubscription'));
};
