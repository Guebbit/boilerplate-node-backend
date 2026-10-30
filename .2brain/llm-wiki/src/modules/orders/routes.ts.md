---
source: src/modules/orders/routes.ts
sha256: 7a39e32f2928afbb953759a49b95ca6f0f35fa8e6f049c12e670e7a393a8609b
generated_at: 2026-10-29T04:44:59.426137+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/routes.ts

## Purpose

Express router that defines all HTTP endpoints for the Orders module. It wires each route to its controller, attaches authentication/authorization guards, cache-control headers, rate limits, and idempotency protection. The file also encodes route-ordering rules (static segments before `/:id`) and the boundary between this router and the `invoicing` module's sibling router (which owns `/invoice` and `/credit-note` at the same `/orders` base path).

## Key elements

- **`router`** (exported) — the Express `Router` instance mounted at `/orders` at the app tier.
- **`isOperatorCancel`** (module-local) — predicate returning `true` when the authenticated caller holds `update:Order`; used to gate `requireFreshAuthWhen` on the cancel route so an operator's money-moving cancel demands a fresh session while a buyer's own cancel passes through.
- **Router-level middleware** (`getAuth`, `isAuth`) — every order route requires a *session*; API keys are deliberately excluded so that customer-scoped reads (`/:id`, `/:id/cancel`) cannot silently widen scope via a credential with no `authContext`.
- **Route table** — 16 endpoints covering: search, list, CSV export, create, bulk delete, cancel, status-override, shipping-address update, timeline, single get/put/patch/delete, restore, and hard-delete. Each carries its own permission, cache, or idempotency middleware as appropriate.

## Relationships

- **`@kernel/middlewares/authorizations`** — supplies `getAuth`, `isAuth`, `requirePermission`, and `requireFreshAuthWhen`; the router composes them per-route to enforce session auth and granular ability checks.
- **`@kernel/ability`** — `holds` is called inside `isOperatorCancel` to test the `update:Order` ability at request time.
- **`@kernel/permissions`** — `callerForSubject` builds the ability-checker subject from the request's `authContext`.
- **`@infrastructure/http/middlewares/cache`** — `noStore` (POST search), `privateNoCache` (GET list, `/:id/timeline`, `/:id`), and `invalidateCache(['products'])` (POST create, POST cancel) are applied per-route.
- **`@infrastructure/http/middlewares/idempotency`** — `idempotencyKey` is applied to `POST /orders` so a retried creation replays the same order.
- **`@infrastructure/http/middlewares/route-flag`** — `routeFlag('hardDelete')` on `DELETE /:id/hard` sets the query-flag the controller expects.
- **Controllers** (`get-orders`, `create-order`, `update-order`, `put-shipping-address`, `delete-orders`, `restore-orders`, `get-order-item`, `get-orders-export`, `get-order-timeline`, `post-cancel-order`, `post-order-status-override`) — each route handler is the corresponding exported controller function; the router performs no business logic itself.

## Notes

- **Route order is load-bearing.** `/search`, `/export`, `/:id/cancel`, `/:id/status-override`, `/:id/shipping-address`, `/:id/timeline`, and `/:id/hard` must all be registered before the bare `GET /:id` or `PUT /:id`, otherwise Express matches the parametric route first.
- **Auth is session-only by design.** `isAuth` (not `isAuthOrCredential`) is used so that credential-based requests cannot reach the customer-scoped `/:id` routes and inadvertently broaden the visible scope. Opening this module to API-key callers requires splitting the router first.
- **Invoice / credit-note routes live elsewhere.** `GET /orders/:id/invoice` and `/credit-note` are mounted by the `invoicing` module's own router at the same base path; they are intentionally absent here.
- **Cache policy is per-route, not global.** The router mixes `noStore`, `privateNoCache`, and `invalidateCache` based on whether the response is caller-specific, writable, or a mutation that invalidates product data. There is no blanket cache header.
