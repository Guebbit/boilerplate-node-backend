---
source: src/modules/orders/routes.ts
sha256: e33768da2d61b35e2d4ef6d2f434c9f4c17f577683b1e2e6219431f13df1da0b
generated_at: 2026-10-15T11:06:39.596558+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/routes.ts

## Purpose

Express router for all order-management endpoints. It wires authentication, permission checks, caching headers, rate limits, and idempotency guards onto the order controllers and mounts them under the `/orders` basePath. It does not contain business logic; it defines *which* controller handles *which* path, in what order, under which guard.

## Key elements

- **`router`** (exported `Router`) — the sole export; all other imports are used to configure it.
- **Global middleware (`getAuth` → `isAuth`)** — enforces session-based auth for every route. Deliberately `isAuth` (session only), not `isAuthOrCredential`, because customer-scoped routes (`/:id`, `/:id/cancel`) narrow reads via `orderService.callerScope(authContext)`; an API-key credential would resolve to no `authContext` and silently widen scope.
- **Route ordering** — static segments (`/search`, `/export`) and longer param paths (`/:id/cancel`, `/:id/status-override`, `/:id/timeline`, `/:id/restore`, `/:id/hard`) are registered before the bare `/:id` routes so Express doesn't swallow them.
- **Caching strategy** — `noStore` on POST responses; `privateNoCache` on caller-scoped GETs (list, single, timeline); no Redis `Cache-Control` for caller-scoped reads because the result depends on the identity of the caller (RFC 9111 §3.5). `invalidateCache(['products'])` is applied to mutations that change product inventory.
- **`idempotencyKey`** — applied to `POST /orders` so retried creations replay the same order.
- **`ordersExportLimiter`** (from `./rate-limits`) — per-account rate limit on `GET /orders/export`.
- **`routeFlag('hardDelete')`** — applied to `DELETE /:id/hard` to inject the `hardDelete` flag into the request so the shared `deleteOrders` controller can branch on it.
- **`requirePermission('orders.any.*')`** — step-up permission checks on admin-only mutations (create, update, delete, override, export, restore).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, `requirePermission`; the three guards applied at router level and per-route.
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `noStore`, `privateNoCache`, `invalidateCache`; controls HTTP cache semantics per route.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — provides `idempotencyKey`; ensures idempotent order creation.
- **`src/infrastructure/http/middlewares/route-flag.ts`** — provides `routeFlag`; used to tag the hard-delete route.
- **`src/modules/orders/controllers/*`** — each controller (`getOrders`, `createOrder`, `replaceOrderById`, `updateOrderById`, `deleteOrders`, `restoreOrders`, `getOrderItem`, `getOrdersExport`, `getOrderTimeline`, `postCancelOrder`, `postOrderStatusOverride`) is the terminal handler for one or more routes on this router.
- **`src/modules/orders/module.ts`** — registers this `router` at the app level under the `/orders` mount point.

## Notes

- **`GET /orders/:id/invoice` and `/orders/:id/credit-note` are intentionally absent.** The `invoicing` module mounts its own router at the same `/orders` basePath and owns those two paths. Router registration order at the app tier (see `invoicing/module.ts`) determines which router wins for overlapping prefixes.
- **Session-only auth is a load-bearing invariant.** Opening this router to API-key credentials requires splitting it into separate customer-facing and admin-facing routers first; otherwise the `authContext`-narrowing logic in the service layer is bypassed.
- **`DELETE /orders` (no `:id`) and `DELETE /orders/:id` share the `deleteOrders` controller.** The controller infers scope from the presence of `id` in the params/body.
- **`DELETE /orders/:id/hard` and `DELETE /orders/:id?hardDelete=true` are equivalent.** The path variant exists so the flag is visible in URLs/logs; `routeFlag` normalises it into the same request shape the query-param variant produces.
