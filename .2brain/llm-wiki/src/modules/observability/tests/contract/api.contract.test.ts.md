---
source: src/modules/observability/tests/contract/api.contract.test.ts
sha256: ee8351c44ff6b2c449dfbe30e89508719400bc994fc17d5783caf39d66cd9599
generated_at: 2026-10-29T04:36:46.265136+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the four `/observability` JSON endpoints (`/health`, `/metrics/overview`, `/audit`, `/events`). They pin the response shapes, field vocabularies, and error-body conventions that API clients code against, covering cases a serializer-level assertion would miss because the payloads are assembled field-by-field rather than through a shared serializer.

## Key elements

- **`pollUntilAudited(bearer, query)`** — helper that polls `GET /observability/audit` via `eventually()` until the fire-and-forget audit entry is visible, then returns the final response. Exists because `audit-logs.record()` is intentionally void and non-awaitable in production.
- **`describe('GET /observability/health')`** — asserts status 200, live database readiness, a single four-word dependency vocabulary (`ready|connecting|unavailable|disabled`) across `database`/`cache`/`queue`, an `ok|degraded` fold, `analytics.provider` (string) + `analytics.configured` (boolean), `queues` as an array, and `jobs` reflecting a real seeded `leaseModel` document (lastSuccessAt, lastError).
- **`describe('GET /observability/metrics/overview')`** — asserts 200 and that counter keys exist with numeric values even when the owning module is absent (reports `0`, not a missing key).
- **`describe('GET /observability/audit')`** — asserts 200 for empty and populated logs, `outcome` filter narrowing, `meta.totalItems`/`pageSize`, and 422 for out-of-range `pageSize`, unparseable or date-only `since`, and invalid `outcome` enum values.
- **SSE section (truncated)** — reads `GET /events` only up to its first frame; frame-content assertions live in `stream.test.ts`.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`import '@tests/contract'`) that registers global contract matchers used by the assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-test database connection before any test runs.
- **`tests/support/http.ts`** — provides `api()`, `authenticateAs()`, and `loginCompleting()` for issuing requests and obtaining bearer tokens.
- **`tests/support/cookies.ts`** — `setCookie` imported for cookie-based auth setup.
- **`tests/support/eventually.ts`** — `eventually()` drives the `pollUntilAudited` retry loop.
- **`src/modules/users/tests/factories.ts`** — `createAdminUser`, `createUser`, `PLAIN_PASSWORD` seed the users that `authenticateAs('admin')` resolves against.
- **`src/infrastructure/runtime/database.ts`** — `connection.readyState` is read directly in the health test to cross-check the reported `database.status`.
- **`src/infrastructure/persistence/lease.ts`** — `leaseModel.create()` writes a real lease document so the health test can verify `jobs` is not a hard-coded empty array.
- **`src/infrastructure/config/store.ts`** — `currentEnvironment` imported (likely used in the truncated SSE section or a skipped/conditional test).

## Notes

- The audit-log sink is **void by contract**; `pollUntilAudited` polls rather than awaits. This is a deliberate test-side cost, not a bug — making `record()` awaitable would change production behaviour.
- Dependency status values are **not** asserted to any specific value (e.g. `ready` for cache) because that depends on the local `.env`. Only the vocabulary set and the `ok`/`degraded` fold are checked.
- The `jobs` test seeds a lease with `_id: 'observability-contract-test.seeded'` to distinguish a real `leaseModel` read from a hard-coded `[]`.
- The metrics-overview test asserts that **absent counters yield `0`, not a missing key**, so the endpoint tolerates module deletion without a 500.
- `import '@tests/contract'` is a bare side-effect import (no named bindings); it does not export anything used locally.
