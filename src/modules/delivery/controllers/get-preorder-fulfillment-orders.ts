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
import { deliveryService } from '../services';

/** Handles `GET /delivery/fulfillment-orders`. */
export const getPreorderFulfillmentOrders = createListController({
    entity: 'preorderFulfillmentOrders',
    schema: ListPreorderFulfillmentOrdersQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    // `late` is a boolean, and `dueWithin` a number, which a query string carries as text.
    input: { booleans: ['late'], numbers: ['dueWithin'] },
    runList: (parsed, request) =>
        deliveryService.listPreorderFulfillmentOrders(parsed, request.authContext)
});

/** Handles `GET /delivery/fulfillment-orders/summary`. */
export const getPreorderSummary = createListController({
    entity: 'preorderSummary',
    schema: SummarizePreorderFulfillmentOrdersQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    runList: (parsed, request) => deliveryService.summarizePreorders(parsed, request.authContext)
});
