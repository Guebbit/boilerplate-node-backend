/**
 * @module
 * Search/list controller for orders — thin wiring onto the shared `createSearchController`
 * factory, scoped through the caller's own visibility.
 */

import { SearchOrdersBody } from '@api/schemas.zod';
import { orderService } from '../service';
import { callerContextOf } from '@infrastructure/http/request';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';

/**
 * Extends the orval-generated SearchOrdersBody with page/pageSize coerced from query-string text.
 * Both come from `@infrastructure/http/schemas` so every search endpoint agrees on what's legal;
 * an absent value stays absent for `normalizePagination` to default.
 */
const searchOrdersQuerySchema = SearchOrdersBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema
});

/**
 * Query parameters that change this endpoint's answer, and therefore its cache key.
 * Derived from the schema, not hand-listed, so the two cannot drift apart.
 */
export const searchOrdersKeyParameters = Object.keys(searchOrdersQuerySchema.shape);

/**
 * GET /orders
 * List/search orders via query parameters or request body.
 * Non-admin users are automatically scoped to their own orders; the userId filter is ignored for non-admin callers.
 */
export const getOrders = createSearchController({
    entity: 'orders',
    schema: searchOrdersQuerySchema,
    // Non-admin callers cannot filter by arbitrary userId; orderService.callerScope enforces their own.
    extendInput: (input, request) => ({
        userId: request.authContext?.admin ? (input.userId as string | undefined) : undefined
    }),
    runSearch: (parsed, request) =>
        orderService.search(
            parsed,
            orderService.callerScope(request.authContext),
            callerContextOf(request)
        )
});
