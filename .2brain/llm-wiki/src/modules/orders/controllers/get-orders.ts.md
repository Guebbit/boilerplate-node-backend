---
source: src/modules/orders/controllers/get-orders.ts
source_sha256: cddef5a868f9511c978f81ea639331cd7244ffb8f3dca0642e760add1e515ab2
context_sha256: 7e5e1c208376cc18491a55c00d3687d08d21ecd81ea318a1e59b14307322178f
generated_at: 2026-11-22T06:09:02.782606+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/get-orders.ts

## Purpose
Controller for `GET /orders` (list/search). It is thin wiring onto the shared `createSearchController` factory: it defines the query schema, a rule for honouring the `userId` filter, and the search call scoped to the caller's own visibility.

## Key elements
- **`searchOrdersQuerySchema`**: the orval-generated `SearchOrdersBody` extended with `page` and `pageSize` (from `pageSchema`/`pageSizeSchema`, coerced from query-string text; absent values stay absent so `normalizePagination` can default them) and `deleted` (`optionalBooleanSchema`, since query strings carry booleans as text).
- **`honourUserIdFilter(input, request)`**: the `extendInput` hook. Returns `{ userId }`, passing `input.userId` through only if the caller holds `display:Order`. Otherwise `userId` is `undefined`. It checks the held rule keys via `heldRules(callerForSubject(authContext, 'Order'))` rather than CASL, because CASL's `holds` also answers true for `read:Order` (both are `read` on `Order`). Exported so the export controller can reuse it.
- **`getOrders`**: the exported controller, built with `createSearchController({ entity: 'orders', schema, extendInput, runSearch })`. `runSearch` calls `orderService.search(parsed, orderService.callerScope(request.authContext), callerContextOf(request))`, then `orderService.withListActions(page, request.authContext)`.

## Relationships
- **`@infrastructure/surfaces/create-search-controller`**: supplies the factory that does the actual controller work. This file only provides the entity name, schema, input extension, and search function.
- **`@infrastructure/http/schemas`**: provides `pageSchema`, `pageSizeSchema` and `optionalBooleanSchema`, shared so all search endpoints agree on what is legal.
- **`@infrastructure/http/request`**: `callerContextOf(request)` builds the caller context passed to the service.
- **`@kernel/permissions`** and **`@kernel/ability`**: `callerForSubject` and `heldRules` are used to decide whether the caller has `display:Order`.
- **`../services`**: `orderService` provides `search`, `callerScope` and `withListActions`.
- **`get-orders-export.ts`**: shares `honourUserIdFilter`, because it filters by the same rule.
- **`routes.ts`**: the module's route definitions, a neighbor in the graph. The file itself does not reference it.

## Notes
- Visibility is enforced in two layers. `honourUserIdFilter` drops the client's `userId` unless `display:Order` is held, and `orderService.callerScope` supplies the caller's own scope. A caller with only `read:Order` sees their own orders, and `display:Order` reads all.
- If `request.authContext` is missing, `userId` is `undefined`.
- Per the doc comment, the endpoint accepts parameters from either the query string or the request body.
