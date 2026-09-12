/**
 * @module
 * Controller for `GET /webhooks/subscriptions`.
 */

import { z } from 'zod';
import { paginationSchema } from '@infrastructure/http/schemas';
import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import type { WebhookSubscription, WebhookSubscriptionsResponse } from '@types';
import { webhooksService } from '../services';

/** Pagination plus the one filter this list takes — `enabled`, pre-decoded by `readInput`'s `booleans`. */
const listWebhookSubscriptionsQuerySchema = paginationSchema.extend({
    enabled: z.boolean().optional()
});

/**
 * GET /webhooks/subscriptions
 * This tenant's subscriptions, newest first. Never returns a secret.
 */
export const listWebhookSubscriptions = createListController({
    entity: 'webhookSubscriptions',
    schema: listWebhookSubscriptionsQuerySchema,
    input: { booleans: ['enabled'] },
    runList: (parsed, request) =>
        webhooksService.listSubscriptions(tenantCallerContextOf(request), parsed).then((result) => {
            // `search()` returns pre-normalized (wire-shape) rows, same reasoning as every other
            // module's list controller — see `audit-logs`' `getAudit` for the fuller comment.
            const items: unknown = result.items;
            return {
                items: items as WebhookSubscription[],
                meta: result.meta
            } satisfies WebhookSubscriptionsResponse;
        })
});
