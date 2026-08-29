# src/modules/observability/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three JSON endpoints under `/observability` (`/health`, `/metrics/overview`, `/audit`). These endpoints build their responses field-by-field in controllers rather than through a shared serializer, making them the most likely to silently drift from the OpenAPI spec. The suite pins their shapes via `toSatisfyApiSpec()` and adds a small number of value-level assertions where the shape alone cannot prove correctness (e.g., the health snapshot reflects the real connection state, the overview tolerates absent counters, the audit page honours its filters).

## Key elements

- **`pollUntilAudited(bearer, query)`** — Polls `GET /observability/audit` up to 20 times (25 ms apart) until a matching entry appears. Exists because the audit sink (`audit-logs`' `record()`) is fire-and-forget by design; a single read would race on a slow machine.
- **`describe('GET /observability/health')`** — Six cases: admin 200, real DB readiness check against `connection.readyState`, vocabulary consistency across all three dependencies, analytics provider + configured flag, non-admin 403, anonymous 401.
- **`describe('GET /observability/metrics/overview')`** — Three cases: admin 200 shape, full-key guarantee even when counters are zero (e.g., `business.checkoutSuccess === 0` proves the endpoint doesn't 500 on an absent metric), non-admin 403.
- **`describe('GET /observability/audit')`** — Five cases: empty-log 200, populated log filtered by `outcome=failure` (driven by a real failed login via `POST /account/login`), out-of-range `pageSize` → 422, unparseable `since` → 422, non-admin 403.

## Relationships

- **`tests/support/contract.ts`** — Supplies the `toSatisfyApiSpec()` matcher imported via `import '@tests/contract'`; the primary shape assertion in every case.
- **`tests/support/http.ts`** — Supplies `api()` (supertest instance) and `authenticateAs(role)` used in every request.
- **`tests/support/setup-test-db.ts`** — Supplies `setupTestDb()`, called once at module scope to bring the test database online before any health assertion.
- **`src/infrastructure/runtime/database.ts`** — Exports `connection`; the health test reads `connection.readyState` to confirm the endpoint reports the process's *actual* Mongo state rather than a hard-coded string.

## Notes

- Two routes are **deliberately absent**: `GET /observability/events` (SSE never completes, so supertest hangs) and `GET /observability/metrics` (Prometheus text behind a static token; the 403 path is covered elsewhere, the 200 requires `NODE_METRICS_TOKEN` in the environment).
- The cache/queue health test asserts only the *vocabulary* (`ready | connecting | unavailable | disabled`) and the derived `status` fold; it does **not** assert which specific value each dependency reports, because that depends on the runner's `.env`.
- The audit polling helper is a test-side cost of the production design (void-returning sink). Making the sink awaitable was explicitly rejected as it would change a real availability property.
- The failed-login test for audit drives `POST /account/login` (owned by the `account` module) rather than inserting a row directly, so it exercises the real emission path.
