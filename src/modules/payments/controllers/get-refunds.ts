/**
 * @module
 * GET /payments/refunds — one row per refund across every payment, for the Refunds tab.
 */

import { ListRefundsQueryParams } from '@api/schemas.zod';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';
import { paymentService } from '../services';

/** The generated query schema, with `page` and `pageSize` read as the query-string text they are. */
const listRefundsQuerySchema = ListRefundsQueryParams.extend({
    page: pageSchema,
    pageSize: pageSizeSchema
});

/** Handles `GET /payments/refunds`. */
export const getRefunds = createSearchController({
    entity: 'refunds',
    schema: listRefundsQuerySchema,
    runSearch: (parsed) =>
        paymentService.listRefunds({
            ...(parsed.status ? { status: parsed.status } : {}),
            ...(parsed.reason ? { reason: parsed.reason } : {}),
            ...(parsed.orderId ? { orderId: parsed.orderId } : {}),
            ...(parsed.createdFrom ? { createdFrom: new Date(parsed.createdFrom) } : {}),
            ...(parsed.createdTo ? { createdTo: new Date(parsed.createdTo) } : {}),
            ...(parsed.page ? { page: parsed.page } : {}),
            ...(parsed.pageSize ? { pageSize: parsed.pageSize } : {})
        })
});
