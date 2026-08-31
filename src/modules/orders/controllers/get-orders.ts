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
 * Built on the orval-generated SearchOrdersBody (kept in sync with
 * openapi.yaml); page/pageSize are coerced from strings since GET requests
 * carry them as query-string text, not JSON numbers.
 *
 * `page`/`pageSize` come from `@infrastructure/http/schemas` so all four search endpoints agree on what a
 * legal one is; absent stays absent, because `normalizePagination` owns the defaults.
 */
const searchOrdersQuerySchema = SearchOrdersBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema
});

/**
 * Query parameters that change this endpoint's answer, and therefore its cache key.
 *
 * Derived from the schema rather than hand-listed, because the two must not drift: a parameter
 * the controller reads but the key omits would let two different requests share one cached
 * response. Anything outside this list is stripped by the validator and changes nothing.
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
