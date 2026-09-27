---
source: src/modules/orders/controllers/get-orders.ts
sha256: 378eca5c09a7a6b2bb55c6077a1437b7de79249f9ce5ba5e4fc0141ed228f069
generated_at: 2026-09-27T15:07:37.841345+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-orders.ts

## Purpose
Thin controller that wires `GET /orders` to the shared `createSearchController` factory. It defines the query schema, enforces caller-based visibility (non-admins see only their own orders), and delegates the actual search to `orderService.search`.

## Key elements
- **`searchOrdersQuerySchema`** — Extends the orval-generated `SearchOrdersBody` with `page`, `pageSize` (from shared infra schemas), and a text-coerced `deleted` boolean. Used as the validation schema for both query-string and body inputs.
- **`getOrders`** (exported) — The controller built by `createSearchController`. Its `extendInput` callback strips `userId` from the input unless the caller holds the `orders.any.read` ability key; `runSearch` passes the parsed input, a caller-derived scope, and caller context into `orderService.search`.

## Relationships
- **`src/infrastructure/surfaces/create-search-controller.ts`** — Supplies the `createSearchController` factory that assembles validation, input extension, and the HTTP response around the callbacks defined here.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the caller context forwarded to `orderService.search`.
- **`src/infrastructure/http/schemas.ts`** — Provides `optionalBooleanSchema`, `pageSchema`, `pageSizeSchema` so this endpoint stays consistent with every other search endpoint.
- **`src/kernel/ability.ts`** — `holdsKey` is used in `extendInput` to check whether the caller's ability set contains `orders.any.read`.
- **`src/kernel/permissions.ts`** — `callerForSubject(request.authContext, 'Order')` resolves the caller's permission subject before the `holdsKey` check.
- **`src/modules/orders/services/index.ts`** — `orderService.search` performs the query; `orderService.callerScope` produces the row-level scope applied server-side.
- **`src/modules/orders/routes.ts`** — Registers `getOrders` on the `/orders` route.

## Notes
- `userId` is **silently dropped** (set to `undefined`) for any caller who does not hold `orders.any.read`. The server-side `callerScope` still enforces visibility regardless, so a non-admin cannot widen their result set by omitting or faking the parameter.
- The permission check targets the exact key `orders.any.read`. A moderator or manager holds this key; asking for a broader key would miss them and silently remove their filter capability.
- `deleted` uses `optionalBooleanSchema` because query strings deliver booleans as text (`"true"`/`"false"`); body payloads pass the boolean straight through.
- Absent `page`/`pageSize` values are intentionally left as `undefined` here; the `createSearchController` factory (via `normalizePagination`) applies defaults.
