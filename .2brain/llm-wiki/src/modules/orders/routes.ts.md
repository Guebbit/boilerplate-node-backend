---
source: src/modules/orders/routes.ts
sha256: 4d9509fa05a18194ffa3a3d5037938f37e2b9185385e2874a402c63f84feebfb
generated_at: 2026-11-08T06:55:10.386782+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/routes.ts

## Purpose
Express router that wires every order-management HTTP endpoint to its controller, attaching the appropriate authentication, permission, cache-control, rate-limit, and idempotency middleware to each route. It exists as the single registration point for the `/orders` path segment within the orders module.

## Key elements
- **`router`** (exported) — the `Router()` instance; mounted at `/orders` by the app tier.
- **`isOperatorCancel`** — request-scoped predicate: returns `true` when the caller holds `update:Order`, used to conditionally require a fresh session on `POST /:id/cancel`.
- **Route table** (in declaration order): `POST /search`, `GET /`, `GET /export`, `POST /`, `POST /:id/cancel`, `POST /:id/status-override`, `PUT /:id/shipping-address`, `GET /:id/timeline`, `POST /:id/timeline/notes`, `DELETE /:id/timeline/notes/:eventId`, `GET /:id`, `PUT /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/restore`, `DELETE /:id/hard`.
- **Shared middleware chain** — `getAuth` + `isAuth` applied router-wide (session-only, no API-key credential path).

## Relationships
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, `requireFreshAuthWhen`, `requirePermission`; applied as global or per-route guards.
- **`src/kernel/ability.ts`** — `holds()` is called inside `isOperatorCancel` to test the `update:Order` ability.
- **`src/kernel/permissions.ts`** — `callerForSubject()` builds the ability subject from the auth context for that same check.
- **`src/infrastructure/http/middlewares/cache.ts`** — `noStore`, `privateNoCache`, `invalidateCache` supply cache-control headers and tag invalidation.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — `idempotencyKey` guards the create-order POST against duplicate submissions.
- **`src/infrastructure/http/middlewares/route-flag.ts`** — `routeFlag('hardDelete')` maps the `/hard` path segment to the same flag the query-string variant uses.
- **Controllers (handlers):** `get-orders` (list/search), `get-order` (single), `get-order-timeline`, `get-orders-export`, `order-notes` (post/delete note), `post-cancel-order`, `post-order-restore`, `post-order-status-override`, `delete-orders` (soft & hard delete).

## Notes
- **Route order is load-bearing.** Static segments (`/search`, `/export`, `/:id/cancel`, `/:id/status-override`, `/:id/shipping-address`, `/:id/timeline`) must precede the bare `/:id` handlers, or Express will match `/:id` first and the static word becomes an `id`.
- **Session-only by design.** `isAuth` (not `isAuthOrCredential`) is used because several routes are customer-scoped; an API-key credential would resolve to no `authContext` and silently widen the caller scope. Opening this router to credentials requires splitting it first.
- **`/orders/{id}/invoice` and `/credit-note` are NOT registered here.** The invoicing module mounts its own router at the same `/orders` basePath and owns those two endpoints.
- **Caller-scoped GETs are never Redis-cached** (`privateNoCache` / `noStore`), because the response depends on *who* is asking. Only the create-order route invalidates a shared tag (`products`).
- **`DELETE /:id/hard` and `?hardDelete=true`** hit the same controller; the route-flag middleware normalises the path-segment form into the query parameter the service expects.
