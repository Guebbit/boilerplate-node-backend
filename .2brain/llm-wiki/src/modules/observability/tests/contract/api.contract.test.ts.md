---
source: src/modules/observability/tests/contract/api.contract.test.ts
sha256: 01903ec70825cc9197a4a5482a44a095f1c45a9621f083eee8893987043bebc6
generated_at: 2026-09-27T15:05:44.432886+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three JSON endpoints under `/observability` (health, metrics overview, audit). Because these endpoints assemble their payloads field-by-field rather than through a shared serializer, shape drift goes unnoticed until a client breaks. This file pins the response contracts via `toSatisfyApiSpec()` and also asserts error-body contracts (422, 401/403) that clients code against. The SSE endpoint `GET /events` is explicitly excluded—`stream.test.ts` owns frame content.

## Key elements

- **`pollUntilAudited(bearer, query)`** — Polls `GET /observability/audit` up to 20 × 25 ms until a matching entry appears. Exists because the audit sink (`audit-logs.record()`) is fire-and-forget by design; there is no awaitable handle to bridge emission to read-back.
- **`describe('GET /observability/health')`** — Asserts spec conformance, live DB status parity with `connection.readyState`, the four-word status vocabulary shared by database/cache/queue, analytics provider + configured pair, `queues` array shape (empty when no broker), and `jobs` reflecting a seeded lease document.
- **`describe('GET /observability/metrics/overview')`** — Asserts spec conformance and that absent counters (e.g. `business.checkoutSuccess`) still appear as zero rather than being omitted.
- **`describe('GET /observability/audit')`** — Asserts spec conformance for empty and populated logs, filtering by `outcome`, pagination meta (`totalItems`, `totalPages`, `pageSize`), and 422 rejection of out-of-range `pageSize` and unparseable/date-only `since`.

## Relationships

- **`tests/support/contract.ts`** — Imported as `@tests/contract`; provides the `toSatisfyApiSpec()` matcher used as the primary assertion throughout.
- **`tests/support/http.ts`** — Imported as `@tests/http`; supplies the `api()` request helper and `authenticateAs()`.
- **`tests/support/cookies.ts`** — Imported as `@tests/cookies`; provides `setCookie` for session-based auth setup.
- **`tests/support/setup-test-db.ts`** — Imported as `@tests/setup-test-db`; `setupTestDb()` is called at module level to provision the test database.
- **`src/infrastructure/persistence/lease.ts`** — `leaseModel` is used to insert a real lease document so the health test can distinguish a genuine `jobHealth()` read from a hard-coded empty array.
- **`src/infrastructure/runtime/database.ts`** — `connection` is read directly to assert the health endpoint reports the live `readyState` rather than a constant.
- **`src/modules/users/tests/factories.ts`** — Imports `createAdminUser`, `createUser`, `PLAIN_PASSWORD` as test fixtures for authentication setup.

## Notes

- The audit-polling helper is not a workaround for a bug; it is the necessary cost of the sink being intentionally non-awaitable in production. Replacing it with an awaitable `record()` would trade a real availability guarantee for test tidiness.
- Cache and queue status values are deliberately **not** asserted to specific strings—only the shared vocabulary (`ready | connecting | unavailable | disabled`) is checked. The actual value depends on the local `.env`; `dependency-health.test.ts` pins the mapping with controlled state.
- The lease-seeding test uses a fixed `_id` (`observability-contract-test.seeded`) so the assertion can locate the job by name; it does not clean up, relying on `setupTestDb()` to drop the collection per run.
- `createAdminUser` / `createUser` / `PLAIN_PASSWORD` are imported but the visible portion of the file delegates authentication to `authenticateAs()`; the factories likely serve truncated or future cases.
