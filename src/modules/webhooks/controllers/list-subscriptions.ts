/**
 * @module
 * Controller for `GET /webhooks/subscriptions`.
 */

import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListWebhookSubscriptionsQueryParams } from '@api/schemas.zod';
import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import type { WebhookSubscription, WebhookSubscriptionsResponse } from '@types';
import { webhooksService } from '../services';

/**
 * GET /webhooks/subscriptions
 * This tenant's subscriptions, newest first. Never returns a secret.
 */
export const listWebhookSubscriptions = createListController({
    entity: 'webhookSubscriptions',
    // `page`/`pageSize` swapped for the infra pair so an absent one stays absent for
    // `normalizePagination` to default; `enabled` is pre-decoded by `readInput`'s `booleans`.
    schema: ListWebhookSubscriptionsQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
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
