---
source: src/modules/returns/tests/unit/routes.test.ts
sha256: ae53849fc6c3694b2c52a82640e7cd6616840f02be90fcaa278d9653921af641
generated_at: 2026-10-15T12:02:06.664006+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/routes.test.ts

## Purpose

Unit test for the returns module's route table. It verifies the exact set of mounted routes, the authorization guards applied to each, the ordering constraint between `GET /options` and `GET /:id`, and which routes carry the `returns-write` rate-limit budget and the `idempotencyKey` middleware.

## Key elements

- **Jest mock** for `@infrastructure/http/middlewares/rate-limit`, replaced with `securityMock()` from the test support module so that guard/chain inspection utilities can introspect the middleware chain without a real limiter.
- **`describe('returns routes — what is mounted')`** — asserts the full route-signature list (`GET /`, `POST /`, `GET /options`, `GET /:id`, `POST /:id/approve`, `POST /:id/decline`, `POST /:id/receive`).
- **`describe('returns routes — authorization')`** — confirms every route has `isAuth`; the four "self-service" routes do **not** have `requirePermissionGuard`; the three staff decision routes **do**.
- **`describe('returns routes — the options read')`** — asserts `GET /options` is registered before `GET /:id` to prevent Express from matching the literal string "options" as an `:id` parameter.
- **`describe('returns routes — rate limiting and idempotency')`** — asserts only `POST /` carries the `returns-write` budget, and that `POST /` and `POST /:id/receive` include the `idempotencyKey` middleware.

## Relationships

- **`src/modules/returns/routes.ts`** — the system under test; this file imports its exported `router` and inspects it.
- **`tests/support/routes.ts`** — provides the three inspection helpers (`routeSignatures`, `guardsOn`, `chainOf`) and the `securityMock()` factory used in the Jest mock, allowing assertions on middleware chains without executing real middleware.

## Notes

- The rate-limit middleware is mocked *before* the `router` import so that the module-level mock is in place when `routes.ts` registers its middleware stack.
- Route-ordering is tested structurally (index comparison in the signature list) rather than via a live HTTP call, keeping the test independent of Express's dispatch behavior.
- `POST /:id/receive` shares the idempotency ledger with `POST /` but does **not** carry the `returns-write` budget — only the initial open is budgeted.
