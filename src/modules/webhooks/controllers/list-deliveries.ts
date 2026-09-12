/**
 * @module
 * Controller for `GET /webhooks/deliveries`.
 */

import { z } from 'zod';
import { paginationSchema } from '@infrastructure/http/schemas';
import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import type { WebhookDelivery, WebhookDeliveriesResponse } from '@types';
import { webhooksService } from '../services';

/**
 * Pagination plus the two filters this list takes. `status` is closed to the wire enum
 * (`../model.ts`'s `WebhookDeliveryStatus`) rather than free text, matching every other closed
 * filter in this repo (`audit-logs`' `outcome` is the precedent) — an unrecognised value is a 422,
 * not a filter that silently matches everything.
 */
const listWebhookDeliveriesQuerySchema = paginationSchema.extend({
    subscriptionId: z.string().optional(),
    status: z.enum(['pending', 'in-flight', 'succeeded', 'failed', 'exhausted']).optional()
});

/**
 * GET /webhooks/deliveries
 * This tenant's delivery log, newest first, optionally filtered by subscription and/or status.
 */
export const listWebhookDeliveries = createListController({
    entity: 'webhookDeliveries',
    schema: listWebhookDeliveriesQuerySchema,
    runList: (parsed, request) =>
        webhooksService.listDeliveries(tenantCallerContextOf(request), parsed).then((result) => {
            const items: unknown = result.items;
            return {
                items: items as WebhookDelivery[],
                meta: result.meta
            } satisfies WebhookDeliveriesResponse;
        })
});
