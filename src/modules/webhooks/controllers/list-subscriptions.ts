/**
 * @module
 * Controller for `GET /webhooks/subscriptions`.
 */

import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListWebhookSubscriptionsQueryParams } from '@api/schemas.zod';
import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import type { WebhookSubscriptionsResponse } from '@types';
import { webhooksService } from '../services';

/**
 * GET /webhooks/subscriptions
 * This tenant's subscriptions, newest first unless `sort` says otherwise. Never returns a secret.
 */
export const listWebhookSubscriptions = createListController({
    entity: 'webhookSubscriptions',
    // `page`/`pageSize` swapped for the infra pair so an absent one stays absent for
    // `normalizePagination` to default; `enabled` is pre-decoded by `readInput`'s `booleans`, and
    // `sort` split on commas by its `csvLists`.
    schema: ListWebhookSubscriptionsQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    input: { booleans: ['enabled', 'autoDisabled'], csvLists: ['sort'] },
    runList: (parsed, request): Promise<WebhookSubscriptionsResponse> =>
        webhooksService.listSubscriptions(tenantCallerContextOf(request), parsed)
});
