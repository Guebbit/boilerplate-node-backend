# src/modules/observability/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three JSON endpoints under `/observability` (`/health`, `/metrics/overview`, `/audit`). Each response shape is hand-assembled field-by-field in the source module rather than produced by a shared serializer, so these tests are the primary guard against silent drift from the OpenAPI spec. They assert both the wire shape (via `toSatisfyApiSpec()`) and a few semantic invariants (status vocabulary, counter presence, pagination meta) that a pure schema check would miss.

## Key elements

- **`pollUntilAudited(bearer, query)`** – Polls `GET /observability/audit` up to 20 times (25 ms apart) until the fire-and-forget audit sink has flushed an entry. Exists because `record()` returns `void` by contract; there is nothing to `await` on the emitting side.
- **`describe('GET /observability/health')`** – Asserts admin auth, spec conformance, that `dependencies.database.status` mirrors the live `connection.readyState`, that all three dependency slots use the same four-word vocabulary, and that the top-level `status` is the honest fold of those values. Also pins the two analytics fields (`provider` string, `configured` boolean).
- **`describe('GET /observability/metrics/overview')`** – Asserts spec conformance and that counters owned by modules absent in the test build still appear as numeric zeros rather than missing keys (prevents a 500 on module deletion).
- **`describe('GET /observability/audit')`** – Covers empty-log shape, populated + filtered rows (driven by a real failed login via `POST /account/login`), `pageSize` over-limit → 422, and unparseable `since` → 422.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) – Provides the `toSatisfyApiSpec()` matcher; every positive and error-path assertion in this file relies on it.
- **`tests/support/http.ts`** (`@tests/http`) – Supplies `api()` (Supertest instance bound to the app) and `authenticateAs()` (returns a bearer token for a given role).
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) – `setupTestDb()` is called at module top-level to establish a connected Mongo instance before any test runs.
- **`src/infrastructure/runtime/database.ts`** (`@infrastructure/runtime/database`) – The `connection` object is read directly in the health test to cross-check that the reported `database.status` reflects the real driver state rather than a hard-coded constant.

## Notes

- `GET /events` (SSE) and `GET /metrics` (requires `NODE_METRICS_TOKEN` in-process) are intentionally excluded here; they are covered or excluded in sibling files for transport reasons, not because their contracts are untested.
- The audit tests deliberately trigger a **real** failed login (`POST /account/login` with bad credentials) rather than writing a synthetic row, so the emit → persist → read path is exercised end-to-end.
- `pageSize` above the spec maximum (100) is expected to return **422**, not a silently clamped page; the test pins this.
- The `since` validation test uses the string `"yesterday"` specifically to hit the "unparseable date → 422" branch; without it, Mongo would treat `Invalid Date` as no-filter and return a deceptively complete page.
