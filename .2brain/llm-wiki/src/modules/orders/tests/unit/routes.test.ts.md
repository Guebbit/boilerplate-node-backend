---
source: src/modules/orders/tests/unit/routes.test.ts
sha256: aca67edadb43b09b65d0407f17106b26d766f25bbdd6879b006ef3eb9db830b2
generated_at: 2026-11-14T20:58:06.759478+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/routes.test.ts

## Purpose

Locks down the orders router's surface: the exact set and order of mounted endpoints, the auth/permission guards on each route, the middleware chain ordering (budget, cache, flags), and the intentional gaps (e.g. `POST /:id/cancel` has no admin guard). It exists so that a refactoring of `routes.ts` cannot silently reorder paths, drop a guard, or change cache semantics without a test failing.

## Key elements

- **`jest.mock` block (× 3)** — stubs `cache`, `route-flag`, and `rate-limit` infrastructure middlewares so the router can be imported in isolation; the mock factories are pulled from `@tests/routes` helpers.
- **`describe('order routes — what is mounted')`** — asserts the full ordered signature list (16 routes), and that `/search` and `/export` are declared *before* `/:id` to avoid path-shadowing 404s.
- **`describe('order routes — authorization')`** — parameterised checks that `isAuth` appears on every route (router-level guard), `requirePermissionGuard` appears on admin-only routes, `POST /:id/cancel` deliberately lacks `requirePermissionGuard`, and read endpoints remain open to any logged-in caller.
- **`describe('order routes — the export budget')`** — verifies `orders-export` budget middleware sits after `requirePermissionGuard` and before the controller.
- **`describe('order routes — staff notes')`** — confirms timeline-note writes require `update:Order` and that the `orders-note` budget is positioned correctly.
- **`describe('order routes — caching')`** — asserts GET reads use `privateNoCache` (never shared Redis), POSTs use `noStore`, order-creation/cancel routes emit `invalidateCache([products])`, and `DELETE /:id/hard` is gated by `routeFlag(hardDelete)` while `DELETE /:id` is not.

## Relationships

- **`src/modules/orders/routes.ts`** — the system under test; the file imports `{ router }` from it and every assertion inspects that router's middleware chain.
- **`tests/support/routes.ts`** — provides the four inspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `chainOf`) and the three middleware mock factories (`cacheMock`, `routeFlagMock`, `securityMock`) used to stub infrastructure middlewares during import.

## Notes

- The module doc-block explicitly calls out that `GET /:id/invoice` and `/credit-note` live in the `invoicing` module's own router (same `/orders` basePath) and are **not** expected here.
- `POST /:id/cancel` lacking `requirePermissionGuard` is an intentional, documented decision (customer self-service cancel); the comment warns that adding the guard would silently remove the feature.
- Route-ordering assertions (`/search` < `/:id`, `/export` < `/:id`) guard against a real Express shadowing bug where a one-segment path is swallowed by a parameterised path declared earlier.
- The `chainOf` assertions encode middleware *position* (guard before budget before controller), not just presence — reordering middleware without changing the set will fail these tests.
