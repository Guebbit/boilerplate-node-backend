/**
 * @module
 * GET /delivery/fulfillment-orders and /delivery/fulfillment-orders/summary
 * The preorder board's two reads: one row per fulfillment order, and per-product unit counts.
 */

import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import {
    ListPreorderFulfillmentOrdersQueryParams,
    SummarizePreorderFulfillmentOrdersQueryParams
} from '@api/schemas.zod';
import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { listPreorderFulfillmentOrders, summarizePreorders } from '../services';

/** Handles `GET /delivery/fulfillment-orders`. */
export const getPreorderFulfillmentOrders = createListController({
    entity: 'preorderFulfillmentOrders',
    schema: ListPreorderFulfillmentOrdersQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    // `preorder` and `late` are booleans, and `dueWithin` a number, which a query string carries as text.
    input: { booleans: ['preorder', 'late'], numbers: ['dueWithin'] },
    runList: (parsed, request) => listPreorderFulfillmentOrders(parsed, request.authContext)
});

/** Handles `GET /delivery/fulfillment-orders/summary`. */
export const getPreorderSummary = createListController({
    entity: 'preorderSummary',
    schema: SummarizePreorderFulfillmentOrdersQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    runList: (parsed, request) => summarizePreorders(parsed, request.authContext)
});
