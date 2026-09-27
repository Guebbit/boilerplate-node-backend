---
source: src/modules/orders/tests/unit/routes.test.ts
sha256: d656cd98719787654f01e9eb30b28c438e33a6ed86670df7fba195c376f89c15
generated_at: 2026-09-27T15:22:12.716349+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/routes.test.ts

## Purpose
Pins down the structural contract of the orders router: which endpoints exist and in what order, which guards protect each one, what cache headers each route emits, and which routes carry the invoice rate-limit. Acts as a living spec so that adding or reordering routes, dropping a guard, or changing cache policy requires an explicit test update.

## Key elements
- **`describe('order routes — what is mounted')`** — asserts the exact 13-route signature list and enforces that `/search` precedes `/:id` (genuine shadowing) and `/:id/invoice` precedes `/:id` (readability convention).
- **`describe('order routes — authorization')`** — via `it.each`, verifies every route has `isAuth`; only the six destructive writes carry `requirePermissionGuard`; `POST /:id/cancel` is explicitly asserted *without* that guard (owner-scope is enforced in the service layer).
- **`describe('order routes — caching')`** — confirms GETs use `privateNoCache` (no shared Redis), POSTs use `noStore`, `GET /:id/invoice` has no `setCache`, and both `POST /` and `POST /:id/cancel` call `invalidateCache([products])`. Also asserts `routeFlag(hardDelete)` is present only on `DELETE /:id/hard`.
- **`describe('order routes — invoice rate limiting')`** — asserts the `orders-invoice` rate-limit key appears only on `GET /:id/invoice` and on no other route.
- **`jest.mock` blocks** (top of file) — replace `cache`, `route-flag`, and `rate-limit` middleware with factories from the test-support module so assertions can inspect the chain without real infrastructure.

## Relationships
- **`src/modules/orders/routes.ts`** — the module under test; this file imports its `router` export and makes all assertions against it.
- **`tests/support/routes.ts`** — supplies the inspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `chainOf`) and the mock factories (`cacheMock`, `routeFlagMock`, `securityMock`) used by the `jest.mock` calls.

## Notes
- The `jest.mock` factories are retrieved via `jest.requireActual('@tests/routes')`, meaning the support module must export the mock builders alongside its inspection helpers — adding a new mock there is the single point of change.
- The "no `requirePermissionGuard` on `POST /:id/cancel`" test is a deliberate safeguard: removing it (or accidentally adding the guard) would strip the only customer-facing write. The service-scope authorization is covered separately in `service-scope.test.ts` / `cancel.test.ts`.
- Route-ordering assertions (`/search` < `/:id`, `/:id/invoice` < `/:id`) exist to prevent silent shadowing regressions or convention decay, not to test runtime behavior.
- The file references `shared/authorization-keys.yaml` (`stepUp: critical` on `orders.any.override`) and `rate-limits.ts` for *why* certain assertions hold; those are documentation pointers, not imports.
