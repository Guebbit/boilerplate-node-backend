/**
 * @module
 * Controller for `GET /webhooks/deliveries`.
 */

import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListWebhookDeliveriesQueryParams } from '@api/schemas.zod';
import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import type { WebhookDeliveriesResponse } from '@types';
import { webhooksService } from '../services';

/**
 * GET /webhooks/deliveries
 * This tenant's delivery log, newest first, optionally filtered by subscription and/or status.
 */
export const listWebhookDeliveries = createListController({
    entity: 'webhookDeliveries',
    // `status` closed to the generated wire enum — an unrecognised value 422s rather than
    // silently matching every row, same as `audit-logs`' `outcome`. `page`/`pageSize` swapped
    // for the infra pair so an absent one stays absent for `normalizePagination` to default.
    schema: ListWebhookDeliveriesQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    runList: (parsed, request): Promise<WebhookDeliveriesResponse> =>
        webhooksService.listDeliveries(tenantCallerContextOf(request), parsed)
});
