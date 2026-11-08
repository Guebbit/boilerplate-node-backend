---
source: src/modules/observability/tests/contract/api.contract.test.ts
sha256: ee8351c44ff6b2c449dfbe30e89508719400bc994fc17d5783caf39d66cd9599
generated_at: 2026-11-08T06:42:00.564735+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/observability` API. The three JSON endpoints (`/health`, `/metrics/overview`, `/audit`) build their response bodies field-by-field rather than through a shared serializer, making them prone to silent shape drift. This file pins the exact JSON shapes, status codes, and error bodies that a client codes against. `GET /events` (SSE) is read only up to its first event; frame-level assertions live in `stream.test.ts`.

## Key elements

- **`pollUntilAudited(bearer, query)`** — Helper that polls `GET /observability/audit` until at least one entry appears, then returns the full response. Needed because `audit-logs.record()` is fire-and-forget (`void` return) by design.
- **`describe('GET /observability/health')`** — Asserts 200 shape, live DB `readyState` correlation, a unified 4-word status vocabulary across database/cache/queue, `telemetry.analytics.{provider, configured}` types, `queues` as an array, and `jobs` reflecting a seeded lease document.
- **`describe('GET /observability/metrics/overview')`** — Asserts 200 and that the full key set is present even for counters owned by modules not exercised in this suite (e.g. `business.checkoutSuccess` = 0, not absent).
- **`describe('GET /observability/audit')`** — Covers empty log, populated log filtered by `outcome`, `pageSize`/`totalItems`/`totalPages` meta, and 422 responses for oversized `pageSize`, unparseable `since`, date-only `since`, and invalid `outcome` values.
- **SSE test (truncated in source)** — Reads `GET /events` up to the first event to verify the stream handshake shape.

## Relationships

- **`tests/support/contract.ts`** — Side-effect import (`@tests/contract`) that registers the contract-test assertion helpers used by every `expect` in this file.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision a clean test database before any test runs.
- **`tests/support/http.ts`** — Provides `api()` (the HTTP client), `authenticateAs('admin')` (token acquisition), and `loginCompleting` (used in the audit-emission test).
- **`tests/support/eventually.ts`** — `eventually()` powers the polling loop inside `pollUntilAudited`.
- **`src/modules/users/tests/factories.ts`** — `createAdminUser`, `createUser`, `PLAIN_PASSWORD` set up the identities that `authenticateAs` relies on.
- **`src/infrastructure/runtime/database.ts`** — `connection.readyState` is read directly to cross-check that the health snapshot reflects the live process state, not a constant.
- **`src/infrastructure/persistence/lease.ts`** — `leaseModel.create(...)` seeds a real lease document so the `jobs` assertion can distinguish a live read from a hard-coded `[]`.
- **`src/infrastructure/config/store.ts`** — `currentEnvironment` imported (used in the SSE or environment-conditional assertions in the truncated portion).
- **`tests/support/cookies.ts`** — `setCookie` imported for the SSE/streaming test setup (truncated section).

## Notes

- **Polling is intentional, not a workaround.** `audit-logs.record()` returns `void` and swallows failures so a Mongo hiccup never turns a rejected login into a 500. There is no awaitable signal to wait on, so `eventually`-based polling is the direct consequence of that production choice.
- **Status vocabulary is asserted, specific values are not.** Cache and queue report one of `ready | connecting | unavailable | disabled`, but *which* one depends on the local `.env`. The test only requires all three dependencies use the same vocabulary and that `status` is the correct fold. The exact mapping is pinned in `dependency-health.test.ts` with controlled state.
- **Lease seeding is the anti-hardcode check.** Every other health test hits an empty `leases` collection; a hard-coded `[]` would pass. The single seeded document with a known `lastSuccessAt`/`lastError` proves `jobHealth()` actually reads the collection.
- **422 over silent truncation.** Out-of-range `pageSize` and invalid filter values produce 422 rather than a smaller or unfiltered result, because the audit endpoint pages and a "complete" page that is actually wrong is worse than a rejected request.
