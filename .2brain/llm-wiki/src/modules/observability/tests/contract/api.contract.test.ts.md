---
source: src/modules/observability/tests/contract/api.contract.test.ts
generated_at: 2026-11-22T06:04:17.299053+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/observability` module's three JSON endpoints (`/health`, `/metrics/overview`, `/audit`). These responses are assembled field by field, with no shared serializer constraining them, so they can drift from the spec unnoticed. The file also checks each route's 401/403 refusal bodies. `GET /events` (an endless SSE stream) is only read up to its first event. `stream.test.ts` owns the frame contents.

## Key elements
- `setupTestDb()` is called at module level to provide a connected test database.
- `pollUntilAudited(bearer, query)` polls `GET /observability/audit` via `eventually` until `items` is non-empty, then returns a fresh read. It is needed because the audit sink's `record()` is fire-and-forget by design (returns `void`, swallows failures), so there is nothing to await.
- `describe('GET /observability/health')` covers:
  - 200 for an admin.
  - `dependencies.database.status` is `'ready'`, backed by `connection.readyState === 1`.
  - database, cache and queue all use the vocabulary `ready | connecting | unavailable | disabled`. Top-level `status` is `'ok'` only if every dependency is `ready` or `disabled`, otherwise `'degraded'`.
  - `telemetry.analytics` has a string `provider` and a boolean `configured`.
  - `queues` is an empty array, because RabbitMQ is disabled in the test environment.
  - a seeded `leaseModel` document shows up in `jobs` with an ISO `lastSuccessAt` and its `lastError`. This proves `jobHealth()` really reads the collection.
- `describe('GET /observability/metrics/overview')` covers:
  - 200 for an admin.
  - a full shape even when no module owns a counter: `http.totalRequests` is a number, `auth.loginSuccess > 0`, and `business.checkoutSuccess` is `0` (reported, not omitted).
- `describe('GET /observability/audit')` covers:
  - 200 on an empty log.
  - a real failed `POST /account/login`, then filtering with `?outcome=failure&pageSize=10`. It checks that all items are failures and that `meta.totalItems > 0` and `meta.pageSize === 10`.
  - 422 for `pageSize=5000` (maximum is 100).
  - 422 for an unparseable `since` (`yesterday`) and for a date-only `since` (`2026-01-01`).
  - 422 for an `outcome` outside success/failure.
  - The remaining cases, including the refusal checks, fall past the visible part of the file.

## Relationships
- `tests/support/http.ts`: `api()`, `authenticateAs('admin')` and `loginCompleting` drive requests and supply the bearer token.
- `tests/support/setup-test-db.ts`: `setupTestDb()` sets up and tears down the DB.
- `tests/support/eventually.ts`: `eventually` powers the audit polling.
- `tests/support/contract.ts`: imported for its side effects (`import '@tests/contract'`), which presumably register the contract matchers.
- `tests/support/cookies.ts`: `setCookie` is imported.
- `src/modules/users/tests/factories.ts`: `createAdminUser`, `createUser` and `PLAIN_PASSWORD` are imported.
- `src/infrastructure/runtime/database.ts`: its `connection` export is imported, and `connection.readyState` is asserted to be live (`1`).
- `src/infrastructure/persistence/lease.ts`: its `leaseModel` export is imported and used to seed a lease document for the `jobs` assertion.
- `src/infrastructure/config/store.ts`: `currentEnvironment` is imported.

## Notes
- Cache and queue statuses are deliberately not pinned to a specific value, because they depend on the runner's `.env`. `dependency-health.test.ts` pins the status mapping, and `queue.test.ts` covers non-empty `queues` with a mocked broker.
- The audit test drives a real login failure (`src/modules/account/audit.ts` owns `auth.login`) instead of writing a synthetic row.
- `auth.loginSuccess > 0` depends on `authenticateAs` having logged in earlier in the same suite.
- A single read after emitting an audit entry would be a race. Polling is the intended cost of the fire-and-forget sink.
