---
source: src/modules/orders/routes.ts
sha256: 67d07381d360f4efae4947d97971f362aafa43ed96cd6fb1734f86a4bd3b8642
generated_at: 2026-11-14T20:40:50.933321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/routes.ts

## Purpose

Express router that wires every order-management endpoint (list, read, create, cancel, override-status, shipping-address, timeline, notes, export, soft/hard delete, restore) behind a session-only auth guard and attaches the correct permission, cache, idempotency, and rate-limit middleware per route. Route registration order is load-bearing: static segments (`/search`, `/export`) and longer parameter paths (`/:id/hard`, `/:id/override-status`) must precede the bare `/:id` wildcard.

## Key elements

- **`router`** (exported `Router`) — the single public export; mounted at `/orders` by the app tier.
- **`isOperatorCancel`** (local helper) — returns `true` when the caller holds `update:Order`; used by `requireFreshAuthWhen` to demand a fresh session only for operator-initiated cancels (the path that can refund or retain funds).
- **Route table** (registration order):
  - `POST /search` → `getOrders` (scoped; `noStore`)
  - `GET /` → `getOrders` (scoped; `privateNoCache`)
  - `GET /export` → `getOrdersExport` (`export:Order` step-up + per-account rate limit)
  - `POST /` → `createOrder` (`create:Order` + idempotency + product-cache invalidation)
  - `POST /:id/cancel` → `postCancelOrder` (fresh-auth for operators; product-cache invalidation)
  - `POST /:id/override-status` → `postOrderOverrideStatus` (`override:Order`)
  - `PUT /:id/shipping-address` → `putShippingAddress` (`update:Order`)
  - `GET /:id/timeline` → `getOrderTimeline` (`privateNoCache`)
  - `POST /:id/timeline/notes` → `postOrderNote` (`update:Order` + rate limit + idempotency)
  - `DELETE /:id/timeline/notes/:eventId` → `deleteOrderNote`
  - `GET /:id` → `getOrderItem` (`privateNoCache`)
  - `PUT /:id` → `replaceOrderById` (`update:Order`)
  - `PATCH /:id` → `updateOrderById` (`update:Order`)
  - `DELETE /:id` → `deleteOrders` (`delete:Order`)
  - `POST /:id/restore` → `restoreOrders` (`delete:Order`)
  - `DELETE /:id/hard` → `deleteOrders` (`delete:Order` + `routeFlag('hardDelete')`)

## Relationships

| Neighbor | Interaction |
|---|---|
| `@kernel/middlewares/authorizations` | `getAuth`, `isAuth` applied router-wide; `requirePermission` per route; `requireFreshAuthWhen` on cancel. |
| `@kernel/ability` | `holds` is called inside `isOperatorCancel` to check `update:Order`. |
| `@kernel/permissions` | `callerForSubject` builds the ability subject for that same check. |
| `@infrastructure/http/middlewares/cache` | `noStore`, `privateNoCache`, `invalidateCache` attached to individual routes. |
| `@infrastructure/http/middlewares/idempotency` | `idempotencyKey` guards order creation and note creation against replay. |
| `@infrastructure/http/middlewares/route-flag` | `routeFlag('hardDelete')` converts a path segment into a query flag consumed by `deleteOrders`. |
| `controllers/get-orders` | Serves `POST /search` and `GET /`. |
| `controllers/get-order` | Serves `GET /:id`. |
| `controllers/get-order-timeline` | Serves `GET /:id/timeline`. |
| `controllers/get-orders-export` | Serves `GET /export`. |
| `controllers/order-notes` | Serves `POST /:id/timeline/notes` and `DELETE /:id/timeline/notes/:eventId`. |
| `controllers/post-cancel-order` | Serves `POST /:id/cancel`. |
| `controllers/post-order-override-status` | Serves `POST /:id/override-status`. |
| `controllers/delete-orders` | Serves both `DELETE /:id` and `DELETE /:id/hard`. |
| `controllers/post-order-restore` | Serves `POST /:id/restore`. |

## Notes

- **Session-only auth.** The router deliberately uses `isAuth` (not `isAuthOrCredential`). An API key on a customer-scoped route (`/:id`, `/:id/cancel`) would resolve to no `authContext` and silently widen the read scope beyond the caller's own orders.
- **Route order is a correctness constraint, not a style choice.** `POST /search`, `GET /export`, `PUT /:id/shipping-address`, `POST /:id/override-status`, and `DELETE /:id/hard` must all precede their `/:id` counterparts; reordering causes silent 404s or wrong-handler dispatch.
- **Cache policy is per-route and intentional.** Customer-scoped reads use `privateNoCache` (browser may cache, revalidate); the search POST uses `noStore` (RFC 9111 §3.5 — answer depends on caller identity); the export controller sets its own `private, no-store` on the file response. No route uses a shared/Redis cache for caller-scoped data.
- **Idempotency + rate-limit ordering.** On note creation the permission check runs first, then the per-account budget, then the idempotency ledger — a replayed note still consumes budget.
- **`DELETE /:id/hard` reuses `deleteOrders`.** The `routeFlag('hardDelete')` middleware injects the flag so the controller's `?hardDelete=true` branch fires without the caller passing a query string.
- **Invoicing routes are absent by design.** `GET /orders/:id/invoice` and `/credit-note` live in the `invoicing` module's own router, which mounts at the same `/orders` basePath. App-tier router order between the two is documented in `invoicing/module.ts`.
