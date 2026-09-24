---
source: src/modules/observability/tests/contract/api.contract.test.ts
sha256: 2a224000e26e7591a5d08c5e3d27ab355ea6314720d290ddd807ab6918f964fb
generated_at: 2026-09-23T18:57:57.642671+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three JSON `/observability` endpoints (`/health`, `/metrics/overview`, `/audit`) that are hand-assembled rather than serializer-driven. They pin response shapes against the OpenAPI spec (`toSatisfyApiSpec()`) and assert specific field semantics that a pure shape check cannot catch (e.g. database state reflects a live connection, audit entries actually land, out-of-range parameters return 422). `GET /events` (SSE) and `GET /metrics` (token-gated) are intentionally excluded for transport reasons.

## Key elements

- **`pollUntilAudited(bearer, query)`** — Helper that retries `GET /observability/audit` up to 20 × 25 ms until a non-empty `items` array appears. Exists because the audit sink is fire-and-forget by design (`record()` returns `void`), so no awaitable signal is available between emit and read.
- **`describe('GET /observability/health')`** — Asserts: 200 + spec shape; `dependencies.database.status` matches the real `connection.readyState`; all three dependency statuses use the same four-word vocabulary (`ready|connecting|unavailable|disabled`) and `status` is the honest fold; `telemetry.analytics` carries both `provider` (string) and `configured` (boolean); `queues` is an array (empty in this env); `jobs` reflects a **seeded lease document** proving the endpoint reads the collection rather than returning a constant `[]`.
- **`describe('GET /observability/metrics/overview')`** — Asserts: 200 + spec shape; counter keys are present even when no module owns them (reports zero rather than omitting); `auth.loginSuccess > 0` (from the login in the audit test) while `business.checkoutSuccess === 0`.
- **`describe('GET /observability/audit')`** — Asserts: empty-log shape; rows filtered by `outcome=failure` after a real failed `POST /account/login`; pagination meta (`totalItems`, `totalPages`, `pageSize`); 422 for `pageSize` above the spec maximum; 422 for unparseable or date-only `since`; 422 for an `outcome` value outside `success|failure`.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — Side-effect import at the top of the file; registers the `toSatisfyApiSpec()` matcher used throughout.
- **`tests/support/http.ts`** (`@tests/http`) — Provides `api()` (Supertest wrapper) and `authenticateAs(role)` used by every test.
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) — `setupTestDb()` is called once at module load to connect the test MongoDB instance before any test runs.
- **`src/infrastructure/runtime/database.ts`** — Exports `connection`; the health test asserts `connection.readyState === 1` to prove the endpoint reports a live connection state, not a hard-coded string.
- **`src/infrastructure/persistence/lease.ts`** — Exports `leaseModel`; the `jobs` test calls `leaseModel.create({...})` to seed a document and verify the endpoint surfaces it.
- **`tests/cross-cutting/contract-search-parity.test.ts`** — Sibling cross-cutting contract test; shares the same `@tests/contract` matcher and `@tests/http` helpers but targets a different endpoint family.

## Notes

- The audit test uses `pollUntilAudited` specifically because the production design makes the sink non-awaitable; the file's comment explicitly rejects the "make `record()` awaitable" alternative as trading a production property for test tidiness.
- The `queues` assertion expects `[]` **in this test environment** (RabbitMQ disabled); a seeded non-empty case is delegated to `queue.test.ts` where the broker is mocked.
- The `jobs` test seeds a lease with a fixed `_id` (`observability-contract-test.seeded`) and a past `lastSuccessAt`; this is the only test in the file that writes to a non-audit collection.
- `GET /events` and `GET /metrics` are excluded here for **transport** reasons (SSE can't be resolved by Supertest; `/metrics` requires `NODE_METRICS_TOKEN` to be set on the process), not because their contracts are weaker.
