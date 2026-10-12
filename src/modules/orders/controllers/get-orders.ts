/**
 * @module
 * Search/list controller for orders — thin wiring onto the shared `createSearchController`
 * factory, scoped through the caller's own visibility.
 */

import type { Request } from 'express';
import { callerForSubject } from '@kernel/permissions';
import { heldKeys } from '@kernel/ability';
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
export const searchOrdersQuerySchema = SearchOrdersBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema,
    // A query string carries `true` as text; the body's own boolean passes straight through.
    deleted: optionalBooleanSchema
});

/**
 * A caller without `orders.any.read` cannot filter by arbitrary userId; orderService.callerScope enforces their
 * own. `orders.any.read` by name, asked of the held KEYS rather than of CASL: `holdsKey`
 * answers true for `orders.self.read` too, since both are `read` on `Order`.
 * Shared with the export, which filters by the same rule.
 *
 * @param input - the merged request input
 * @param request - the request, for who is asking
 */
export const honourUserIdFilter = (
    input: Record<string, unknown>,
    request: Request
): Record<string, unknown> => ({
    userId:
        request.authContext &&
        heldKeys(callerForSubject(request.authContext, 'Order')).has('orders.any.read')
            ? input.userId
            : undefined
});

/**
 * GET /orders
 * List/search orders via query parameters or request body.
 * A caller holding only `orders.self.read` is scoped to their own orders and the userId filter is ignored; `orders.any.read` reads every order.
 */
export const getOrders = createSearchController({
    entity: 'orders',
    schema: searchOrdersQuerySchema,
    extendInput: honourUserIdFilter,
    runSearch: (parsed, request) =>
        orderService.search(
            parsed,
            orderService.callerScope(request.authContext),
            callerContextOf(request)
        )
});
