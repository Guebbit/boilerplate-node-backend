/**
 * @module
 * Search/list controller for orders — thin wiring onto the shared `createSearchController`
 * factory, scoped through the caller's own visibility.
 */

import { callerForSubject } from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import { SearchOrdersBody } from '@api/schemas.zod';
import { orderService } from '../services';
import { callerContextOf } from '@infrastructure/http/request';
import { optionalBooleanSchema, pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';

/**
 * Extends the orval-generated SearchOrdersBody with page/pageSize coerced from query-string text.
 * Both come from `@infrastructure/http/schemas` so every search endpoint agrees on what's legal;
 * an absent value stays absent for `normalizePagination` to default.
 */
const searchOrdersQuerySchema = SearchOrdersBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema,
    // A query string carries `true` as text; the body's own boolean passes straight through.
    deleted: optionalBooleanSchema
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
    // Non-admin callers cannot filter by arbitrary userId; orderService.callerScope enforces their
    // own. `orders.any.read` by name — a moderator or manager holds exactly this key, and asking
    // for anything broader would have missed them and silently dropped their filter.
    extendInput: (input, request) => ({
        userId:
            request.authContext &&
            holdsKey(callerForSubject(request.authContext, 'Order'), 'orders.any.read')
                ? (input.userId as string | undefined)
                : undefined
    }),
    runSearch: (parsed, request) =>
        orderService.search(
            parsed,
            orderService.callerScope(request.authContext),
            callerContextOf(request)
        )
});
