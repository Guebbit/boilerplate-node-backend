---
source: src/modules/orders/controllers/get-orders.ts
sha256: 2a076acce698a50dc63447eb2316dd19a31e61e22b5209dd90df8008bae4a7d7
generated_at: 2026-09-23T19:00:37.921737+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-orders.ts

## Purpose

Thin controller that wires the `GET /orders` endpoint onto the shared `createSearchController` factory. It validates the search/pagination query, enforces caller-scoped visibility (non-admins see only their own orders), and delegates the actual query to `orderService.search`.

## Key elements

- **`searchOrdersQuerySchema`** – Extends the orval-generated `SearchOrdersBody` with `page` and `pageSize` (both from the shared infrastructure schemas). Absent values remain absent so `normalizePagination` can apply defaults.
- **`searchOrdersKeyParameters`** (exported) – Array of parameter names derived via `Object.keys(schema.shape)`. Used as the cache-key field list; keeping it schema-derived prevents drift between validation and caching.
- **`getOrders`** (exported) – The controller returned by `createSearchController`. Its `extendInput` strips `userId` from the parsed input unless the caller holds the `orders.any.read` ability key. Its `runSearch` calls `orderService.search(parsed, orderService.callerScope(authContext), callerContextOf(request))`.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** – Provides the `createSearchController` factory that `getOrders` is built from (handles routing, validation, and pagination plumbing).
- **`src/infrastructure/http/schemas.ts`** – Supplies `pageSchema` and `pageSizeSchema` so all search endpoints share identical pagination validation.
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf(request)`, passed through to the service call.
- **`src/kernel/permissions.ts`** – Supplies `callerForSubject`, used to resolve the effective permission subject for the ability check.
- **`src/kernel/ability.ts`** – Supplies `holdsKey`, checked against `'orders.any.read'` to decide whether the `userId` filter is honored.
- **`src/modules/orders/services/index.ts`** – Provides `orderService` (`.search` and `.callerScope`) which performs the actual data access.
- **`src/modules/orders/routes.ts`** – Registers the `getOrders` controller on the `/orders` route.

## Notes

- **Permission granularity matters:** The check is specifically for `orders.any.read` (not a broader "read" key). A moderator or manager holds exactly this key; using a wider check would silently drop their `userId` filter.
- **`userId` is stripped, not overridden, for non-admins:** `extendInput` sets it to `undefined` so the service's `callerScope` is the sole source of ownership scoping. There is no fallback to "all orders."
- **Cache-key derivation is intentional:** `searchOrdersKeyParameters` is not a hand-maintained list; if the schema changes, the cache key updates automatically. Do not replace it with a static array.
