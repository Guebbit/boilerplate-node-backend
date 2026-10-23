/**
 * @module
 * Controller for `POST /webhooks/subscriptions/:id/disable`.
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
 * POST /webhooks/subscriptions/:id/disable
 * Pauses a subscription by hand; 409 when it already is paused.
 */
export const disableWebhookSubscription = (
    request: Request<{ id: string }>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'generic.error-not-found' });
    if (!id) return;

    const context = tenantCallerContextOf(request);
    return webhooksService
        .disableSubscription(id, context)
        .then((result) => {
            if (refused(response, result)) return;
            return successResponse<WebhookSubscription>(
                response,
                viewSubscription(result.data, context.caller)
            );
        })
        .catch(catchAs(response, 'disableWebhookSubscription'));
};
