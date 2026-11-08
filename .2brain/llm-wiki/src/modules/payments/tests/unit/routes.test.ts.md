---
source: src/modules/payments/tests/unit/routes.test.ts
sha256: 2139bffd555710b9fdb2765ba6806d6827b43f287e38b73fd30df08ca983a091
generated_at: 2026-11-08T07:40:56.051438+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/routes.test.ts

## Purpose

Unit test that pins the **router-level security contract** of the payments module: which endpoints exist, in what order, and which guard each one carries. It treats route order and guard presence as invariants (not just "does it work") because moving a route below the auth wall or dropping a guard would silently break production with no runtime error.

## Key elements

- **`describe('payment routes', …)`** — single top-level suite covering the main router and the order router.
- **`WEBHOOK`, `METHODS`, `INTENT_BUDGET`** — named constants for the two pre-auth routes and the shared velocity-budget key.
- **`withoutHandler(signature)`** — helper that returns a route's guard list minus the final handler, enabling direct list comparison between two routes (e.g. confirm vs. sync).
- **Route-order test** — asserts `routeSignatures(router)` matches a hard-coded 14-entry array, so any added/reordered endpoint fails immediately.
- **Auth-wall tests** — every route except `WEBHOOK` and `METHODS` must include `isAuth`; those two must *not*.
- **Webhook position test** — asserts `WEBHOOK` is index 0, because `router.use(getAuth, isAuth)` applies only to routes declared after it.
- **Admin-guard test** — filters `routeTable(router)` by permission rule (excluding the shopper-facing `checkout:Cart` rule) and asserts exactly seven admin-guarded routes.
- **Confirm ↔ sync guard-comparison test** — asserts `POST /:id/sync`'s guards equal `POST /:id/confirm`'s minus three velocity limiters, the decline-challenge gate, and `idempotencyKey`; also asserts the shared prefix explicitly.
- **Pooled-budget test** — verifies `POST /` (intent) and `POST /:id/sync` share `INTENT_BUDGET` and neither carries `idempotencyKey`.
- **Order-router test** — asserts `orderRouter` exposes exactly `GET /:id/payments` and `POST /:id/payments` with their expected guard stacks.

## Relationships

- **`src/modules/payments/routes.ts`** — imports `router`; this file is the primary subject under test. All `routeSignatures`, `guardsOn`, and `routeTable` calls operate on this router instance.
- **`src/modules/payments/order-routes.ts`** — imports `orderRouter`; the final test block asserts its two payment sub-routes and their guards.
- **`tests/support/routes.ts`** — provides the three inspection helpers (`routeSignatures`, `routeTable`, `guardsOn`) and the `securityMock()` factory consumed by the `jest.mock` override for the rate-limit middleware.

## Notes

- The `jest.mock` for `rate-limit` replaces the real middleware with `securityMock()`, so tests inspect guard *names* rather than executing the rate-limiter. Any new guard added to the real middleware must be mirrored here or the list-comparison tests will break.
- Route **order is the auth mechanism**, not a guard flag. A test asserting `indexOf(WEBHOOK) === 0` is load-bearing: reordering the router without updating this test will pass CI until the webhook silently 401s in production.
- The confirm/sync comparison uses whole-list equality (`.toEqual`) rather than individual `toContain` checks, specifically because `requireFreshAuth(…)` is an anonymous closure with no stable name to assert against.
- `INTENT_BUDGET` is deliberately excluded from the confirm route's expected list; if a future refactor adds it to confirm, the test fails and forces a conscious decision.
