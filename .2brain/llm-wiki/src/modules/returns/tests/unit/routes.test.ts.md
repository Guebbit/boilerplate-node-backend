---
source: src/modules/returns/tests/unit/routes.test.ts
source_sha256: da22073e06f03756901127b589c797f0c338349c5a163e0b575824b67f101ade
context_sha256: 0ae0bc06fa8952164a5484617ec0cbaaa42e30e49201ae36436bb87a5ddce031
generated_at: 2026-11-22T07:39:46.914111+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/unit/routes.test.ts

## Purpose
Unit tests for the returns route table mounted at `/returns`. They check which routes the router exposes, which guards each route carries, the ordering of the `/options` read relative to `/:id`, and the rate-limit, idempotency and step-up chain on `POST /`. The tests inspect the router's structure and never make HTTP requests.

## Key elements
- **Mocks** — `@infrastructure/http/middlewares/rate-limit` is replaced with `securityMock()`. `@kernel/middlewares/authorizations` is replaced with `authGuardsMock()`. Both helpers come from `@tests/routes` and are loaded with `jest.requireActual`.
- **`what is mounted`** — asserts the exact ordered list of 10 route signatures: `GET /`, `POST /`, `GET /options`, `GET /:id`, then `POST /:id/` followed by `approve`, `decline`, `receive`, `proof-of-sending`, `close` and `cancel`.
- **`authorization`**
  - All 10 routes must include the `isAuth` guard.
  - The four reads and opens (`GET /`, `POST /`, `GET /options`, `GET /:id`) must not include `requirePermissionGuard`. The test name says the service scopes them to the caller's own orders.
  - The six `/:id/*` POST actions must include `requirePermissionGuard` ("staff's alone").
- **`the options read`** — `GET /options` must appear before `GET /:id` in the signature list. Otherwise `/:id` would match "options" as an id.
- **`rate limiting and idempotency`**
  - `POST /` includes `returns-write` in its chain, and `GET /` does not.
  - `POST /` and `POST /:id/receive` both include `idempotencyKey`.
- **`guard order on POST /returns`** — the chain must contain `returns-write`, then `requireFreshAuthWhen(critical)`, then `idempotencyKey`, in that order.

## Relationships
- **`src/modules/returns/routes.ts`** — the module under test. The file imports its `router` and checks the router's signatures and middleware chains.
- **`tests/support/routes.ts`** (imported as `@tests/routes`) — supplies the helpers `routeSignatures`, `guardsOn` and `chainOf`, which read the router's structure. It also supplies the `securityMock` and `authGuardsMock` factories.

## Notes
- The `jest.mock` calls come before the `router` import, so the router is built against the mocked middlewares. The tests rely on the mocks leaving recognizable names in the chain, such as `isAuth`, `returns-write`, `idempotencyKey` and `requireFreshAuthWhen(critical)`.
- A comment in the file gives the reason for the guard order. The idempotency ledger records any JSON answer. A step-up challenge placed after the ledger would be replayed as the answer to the same key once the staff member has re-authenticated.
- Only `POST /` is asserted to carry the `returns-write` budget and the step-up guard. `POST /:id/receive` is additionally asserted to be idempotent.
