/**
 * @module
 * GET /payments and POST /payments/search — the staff payments list, one controller for both
 * spellings, through the shared search-controller factory.
 */

import { z } from 'zod';
import { SearchPaymentsBody } from '@api/schemas.zod';
import { blankToUndefined, pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';
import { paymentService } from '../services';

/**
 * A number as a query string carries it: text, so coerced; blank is no filter.
 */
const amountSchema = z.preprocess(blankToUndefined, z.coerce.number().min(0).optional());

/**
 * The generated body schema with the transport coercions a query string needs: `page`, `pageSize`
 * and the two amounts arrive as text.
 */
const searchPaymentsQuerySchema = SearchPaymentsBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema,
    amountMin: amountSchema,
    amountMax: amountSchema
});

/** Handles `GET /payments` and `POST /payments/search`. */
export const getPayments = createSearchController({
    entity: 'payments',
    schema: searchPaymentsQuerySchema,
    runSearch: (parsed, request) => paymentService.listPayments(parsed, request.authContext)
});
