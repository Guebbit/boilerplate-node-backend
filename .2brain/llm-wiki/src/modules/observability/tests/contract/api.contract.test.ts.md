---
source: src/modules/observability/tests/contract/api.contract.test.ts
sha256: 0d55d7546738aac8ebdba2e1d0d1c9128d36831a965e7f066493ee97777ae6c9
generated_at: 2026-10-15T10:56:54.633894+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three JSON endpoints under `/observability` (health, metrics overview, audit). Because those responses are assembled field-by-field in application code rather than produced by a shared serializer, shape drift goes undetected by unit tests. This file pins the wire shape, vocabulary, and validation behavior each client codes against, including error responses (422, 401/403 bodies). `GET /events` (SSE) is intentionally out of scope; `stream.test.ts` owns frame content.

## Key elements

- **`pollUntilAudited(bearer, query)`** — Repeatedly `GET /observability/audit` (up to 20 attempts, 25 ms apart) until a row appears. Exists because `audit-logs.record()` is fire-and-forget by design (`void` return, failures swallowed), so there is no awaitable boundary to assert against.
- **`describe('GET /observability/health')`** — Asserts: 200 for admin; `dependencies.database.status` matches the live `connection.readyState`; all three dependencies use the same four-value vocabulary (`ready | connecting | unavailable | disabled`); top-level `status` folds to `ok`/`degraded` consistently; `telemetry.analytics` carries a `provider` string + `configured` boolean; `queues` is always an array (empty here since RabbitMQ is disabled); `jobs` reflects a seeded `leaseModel` document (name, `lastSuccessAt`, `lastError`).
- **`describe('GET /observability/metrics/overview')`** — Asserts 200 and that counter rows (`http.totalRequests`, `auth.loginSuccess`, `business.checkoutSuccess`) are present as numbers even when the owning module is absent, preventing a 500 on module deletion.
- **`describe('GET /observability/audit')`** — Asserts: 200 on empty log; filtered (`?outcome=failure`) log returns only matching entries with correct `meta.totalItems`/`meta.pageSize`; `pageSize=5000` → 422; unparseable `since` → 422; date-only `since` (no time) → 422; `outcome` outside `success|failure` → 422 (not a silent full-table match).

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — Imported as a side-effect module; presumably registers OpenAPI schema validation so every response is checked against the published spec automatically.
- **`tests/support/setup-test-db.ts`** (`setupTestDb`) — Called once at module top level to point `connection` at the test database before any test runs.
- **`tests/support/http.ts`** (`api`, `authenticateAs`) — All HTTP calls go through the shared `api()` helper; `authenticateAs('admin')` mints a bearer token per test.
- **`tests/support/cookies.ts`** (`setCookie`) — Imported for cookie-based auth paths (used in the truncated remainder of the file).
- **`src/modules/users/tests/factories.ts`** (`createAdminUser`, `createUser`, `PLAIN_PASSWORD`) — Provide deterministic user records so auth assertions are reproducible.
- **`src/infrastructure/runtime/database.ts`** (`connection`) — One test cross-checks `connection.readyState === 1` against the JSON `status` to prove the health snapshot reads the live driver, not a constant.
- **`src/infrastructure/persistence/lease.ts`** (`leaseModel`) — A document is seeded directly via Mongoose to prove `jobHealth()` performs a real `find()` rather than returning a hard-coded `[]`.
- **`src/infrastructure/config/store.ts`** (`currentEnvironment`) — Imported (likely used in the truncated portion for environment-conditional assertions).
- **`src/modules/account/tests/unit/family-liveness.test.ts`** — A sibling contract test in the account module; shares the same `@tests/contract` + factory + `http` helper pattern.

## Notes

- **Do not assert specific dependency values.** The test suite may run without Redis or RabbitMQ; only the four-word vocabulary and the `status` fold are environment-independent. Pinning a value (e.g. `status === 'ready'` for cache) would fail on a laptop.
- **The audit polling helper is intentional, not a workaround.** Making `record()` awaitable to remove the race would trade a real production guarantee (a Mongo blip never surfaces as a 500 on login) for test convenience. The 20 × 25 ms loop is the documented cost.
- **Empty-collection assertions are weak on their own.** The lease-seeding test exists specifically to distinguish a real `find()` from a hard-coded `[]`. If you add new "always-present array" fields, pair them with a seed-and-read test like this one.
- **`@tests/contract` is a side-effect import** (no named bindings destructured). It likely attaches `expect(response).toMatchSchema()`-style matchers globally; removing the import will silently disable schema checks without a TypeScript error.
