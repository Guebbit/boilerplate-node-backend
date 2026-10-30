---
source: src/modules/returns/tests/unit/routes.test.ts
sha256: 1ed9d7463ecba0907a9903d123bd05dfa4b567e4101a0de66a646a353c7079a6
generated_at: 2026-10-29T05:51:09.116027+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/routes.test.ts

## Purpose

Verifies the structural contract of the returns router: which routes are mounted, what guards protect each one, the relative ordering of paths, and the middleware chain (rate-limit, step-up auth, idempotency) on the write endpoints. It exists to catch accidental route additions, guard removals, re-ordering regressions, and chain re-arrangements in `@modules/returns/routes` before they reach integration or production.

## Key elements

- **`jest.mock` blocks** — Replace the real rate-limit and authorization middlewares with shared mocks (`securityMock`, `authGuardsMock`) so the router can be introspected without spinning up live middleware.
- **`routeSignatures(router)`** — Flattens the router into an ordered array of `"METHOD /path"` strings; used to assert the exact set and order of mounted routes.
- **`guardsOn(router, signature)`** — Returns the list of guard names attached to a specific route; the tests use it to assert `isAuth` on every route and `requirePermissionGuard` only on the five staff write actions.
- **`chainOf(router, signature)`** — Returns the ordered middleware chain for a route; used to assert rate-limit budget placement, idempotency-key presence, and the relative ordering of `returns-write` → `requireFreshAuthWhen(critical)` → `idempotencyKey` on `POST /`.
- **Five `describe` blocks** — Cover: (1) mounted route signatures, (2) authorization guards, (3) `GET /options` preceding `GET /:id`, (4) rate-limit & idempotency, (5) guard ordering on `POST /`.

## Relationships

- **`src/modules/returns/routes.ts`** — The module under test. This file imports its exported `router` and inspects it exclusively through the `@tests/routes` helpers; no live HTTP calls are made.
- **`tests/support/routes.ts`** — Supplies all test-introspection utilities (`routeSignatures`, `guardsOn`, `chainOf`) and the two shared mocks (`securityMock`, `authGuardsMock`) that stand in for real middleware during these assertions.

## Notes

- The mocks use `jest.requireActual` to pull the mock factories from `@tests/routes` while still resolving through the mocked module path — this lets both the mock and the helper import the same singleton without circular-reference issues.
- The `GET /options` vs `GET /:id` ordering test is a regression guard: Express/Express-like routers match by insertion order, so if `/options` were ever moved after `/:id`, the literal string `"options"` would be captured as an `:id` param.
- The guard-order test on `POST /` encodes a deliberate security constraint: the step-up (re-auth) challenge must come **after** the rate-limit budget (so brute-force step-up attempts are throttled) but **before** the idempotency ledger (so a step-up challenge is never recorded as a consumable idempotency response).
