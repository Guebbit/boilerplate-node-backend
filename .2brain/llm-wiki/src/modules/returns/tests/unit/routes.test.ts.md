---
source: src/modules/returns/tests/unit/routes.test.ts
sha256: 75f4ecdbcff0426411369a7b6fb6b86c2962476466bfe202121c6b66ab66e19b
generated_at: 2026-11-14T21:49:34.735813+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/routes.test.ts

## Purpose

Unit test for the returns router that verifies the full surface of `@modules/returns/routes`: which routes exist, what middleware guards each one, the relative ordering of routes and middleware, and which writes carry rate-limit budgets or idempotency-key protection. It mocks the rate-limit and authorization infrastructure so the assertions are purely about route configuration.

## Key elements

- **`describe('returns routes — what is mounted')`** — asserts the exact list and order of all 10 route signatures via `routeSignatures(router)`.
- **`describe('returns routes — authorization')`** — three `it.each` blocks confirming: every route requires `isAuth`; read routes (`GET /`, `POST /`, `GET /options`, `GET /:id`) do *not* carry `requirePermissionGuard`; all six POST decision routes do.
- **`describe('returns routes — the options read')`** — asserts `GET /options` is registered before `GET /:id` to prevent "options" being captured as an id parameter.
- **`describe('returns routes — rate limiting and idempotency')`** — verifies only `POST /` carries the `returns-write` rate-limit chain, and that `POST /` and `POST /:id/receive` both include `idempotencyKey`.
- **`describe('returns routes — guard order on POST /returns')`** — asserts the middleware chain on `POST /` is: `returns-write` → `requireFreshAuthWhen(critical)` → `idempotencyKey`. The comment explains *why*: the idempotency ledger records any JSON response, so a step-up challenge after it would be replayed as the idempotent answer.

## Relationships

- **`src/modules/returns/routes.ts`** — the module under test; its exported `router` is the sole subject of every assertion in this file.
- **`tests/support/routes.ts`** — provides the inspection helpers (`routeSignatures`, `guardsOn`, `chainOf`) used throughout the tests, as well as the mock factories (`securityMock`, `authGuardsMock`) referenced by the two `jest.mock` calls that stub out infrastructure middlewares.

## Notes

- The two `jest.mock` calls are hoisted but *after* the import of `routeSignatures`/`guardsOn`/`chainOf` from `@tests/routes`. This works because those helpers are pure inspection utilities, not the things being mocked; only the infrastructure middlewares are replaced.
- The guard-order test encodes a deliberate invariant: step-up auth must come **before** the idempotency ledger, otherwise the ledger would cache the step-up challenge as the "answer" to that key. If middleware order changes, this test is the guardrail.
- The `POST /` route is the only write that carries both a rate-limit budget *and* an idempotency key; `POST /:id/receive` gets idempotency but no budget. The tests pin that asymmetry explicitly.
