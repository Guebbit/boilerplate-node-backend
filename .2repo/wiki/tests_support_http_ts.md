# tests/support/http.ts

## Purpose

HTTP-level test harness that lets contract tests exercise the full Express pipeline (routing, middleware, auth, serialization, error handler) via `supertest`, rather than calling services or repositories directly. This is the only layer where a response body can be meaningfully compared against `openapi.yaml`.

## Key elements

- **`api()`** — Returns a `supertest` instance bound to the mounted Express app from `src/app`. Every contract test uses this as the entry point for HTTP calls.
- **`authenticateAs(role?)`** — Creates a fixture user (`createUser` or `createAdminUser`), calls the real `POST /account/login` endpoint with the fixture's plain-password credential, and returns `{ user, token, bearer }`. Throws a descriptive error if the login response is not `200` or lacks a token.

## Relationships

- **`src/app.ts`** — Imports the fully mounted Express `app`. That file guards its `listen` call behind `NODE_ENV !== 'test'`, so importing it here starts no server, no Mongo, no Redis, no queue.
- **`src/modules/users/tests/fixtures.ts`** — Provides `createUser`, `createAdminUser`, and `PLAIN_PASSWORD` used by `authenticateAs` to seed a user and perform a real login.
- **All `src/modules/*/tests/contract/api.contract.test.ts`** (account, cart, delivery, feedback, inventory, locales, observability, orders, payments, products, users, wishlist) — Import `api()` and `authenticateAs()` to issue HTTP requests and assert response shapes against the OpenAPI contract.
- **`tests/contract/request-contract.test.ts`** — Cross-module contract test that also consumes this harness.

## Notes

- No external services are started on import. The in-memory Mongo is provided separately by `setupTestDb()` in the test bootstrap; Redis failures are treated as cache misses by design, so it is genuinely optional.
- `authenticateAs` deliberately routes through the real login endpoint instead of signing a JWT by hand. If the login contract regresses (wrong status, missing token field, etc.), *every* contract test that authenticates will fail, surfacing the issue at the root cause rather than in each individual assertion.
- The `bearer` field is typed `as const` so it can be used directly in an `Authorization` header without widening.
