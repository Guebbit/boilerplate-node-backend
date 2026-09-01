# src/modules/observability/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three JSON endpoints under `/observability` (`/health`, `/metrics/overview`, `/audit`). They exist because those response bodies are hand-assembled field-by-field (a health snapshot, a Prometheus overview, an audit page) rather than produced by a shared serializer, making them prone to silent drift from the API spec. `GET /events` (SSE) and `GET /metrics` (requires `NODE_METRICS_TOKEN`) are excluded for transport reasons, not contract gaps.

## Key elements

- **`pollUntilAudited(bearer, query)`** – Helper that retries `GET /observability/audit` up to 20 times (25 ms apart) until the audit log contains entries. Exists because `audit-logs.record()` is deliberately fire-and-forget (`void` return, swallows failures) so a Mongo hiccup can't turn a rejected login into a 500; the test must tolerate the write lag rather than await the sink.
- **`describe('GET /observability/health')`** – Verifies shape for admin, cross-checks `connection.readyState === 1` against the reported `database.status`, asserts all three dependency statuses use the same four-value vocabulary (`ready | connecting | unavailable | disabled`) and that top-level `status` is the honest fold of them, checks `analytics.provider` + `analytics.configured` are present, and pins 403/401 error contracts.
- **`describe('GET /observability/metrics/overview')`** – Verifies shape for admin, asserts that counters owned by *other* modules (`auth.loginSuccess`, `business.checkoutSuccess`) appear as numeric zeros rather than missing keys, and pins the 403 error contract.
- **`describe('GET /observability/audit')`** – Verifies empty-log shape, drives a *real* failed login (`POST /account/login`) then polls for the resulting `outcome: 'failure'` row (validating `meta.totalItems`, `meta.pageSize`), and pins 422 responses for `pageSize > 100` and unparseable `since`, plus the 403 contract.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) – Imported for the `toSatisfyApiSpec` matcher; every assertion block that checks a full body delegates structural conformance to it.
- **`tests/support/http.ts`** (`@tests/http`) – Provides the `api()` Supertest wrapper and `authenticateAs()` used in every test.
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) – `setupTestDb()` is called at module scope to establish a live MongoDB connection before any test runs.
- **`src/infrastructure/runtime/database.ts`** – Imports `connection` so the health test can assert `connection.readyState === 1` alongside the endpoint's `database.status: 'ready'`, tying the reported value to the actual driver state.

## Notes

- The file deliberately does **not** assert *which* concrete value `cache`/`queue` report (depends on local `.env`); it only asserts the shared vocabulary and the fold rule. The mapping itself is pinned in `dependency-health.test.ts`.
- `pollUntilAudited` is a conscious trade-off: making the audit sink awaitable to simplify this test would remove a production resilience property. The 20 × 25 ms budget (≤ 500 ms) is the cost accepted.
- The `audit` test triggers a *real* login failure via `POST /account/login` rather than inserting a synthetic row, so it exercises the full emit → persist → read path.
- `contract-search-parity.test.ts` (graph neighbor) is not imported here; the shared contract machinery is provided by `tests/support/contract.ts` instead.
