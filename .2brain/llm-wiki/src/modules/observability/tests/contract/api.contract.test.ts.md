---
source: src/modules/observability/tests/contract/api.contract.test.ts
sha256: 8a258a0c011219918fb8fb5959b582532969c59d4981f1c43160c030e2bf2d10
generated_at: 2026-11-14T20:30:24.392274+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three JSON `/observability` endpoints (`/health`, `/metrics/overview`, `/audit`) plus the first-event shape of the `/events` SSE stream. They verify that each response matches the OpenAPI schema registered by `@tests/contract` and that the *values* carry the invariants a client codes against (status vocabulary, error-body shape, pagination meta), rather than merely checking that a 200 was returned.

## Key elements

- **`pollUntilAudited(bearer, query)`** — polls `GET /observability/audit` until at least one item appears, then returns the final response. Exists because the audit sink is fire-and-forget (`record()` returns `void`); a single read would race on a fast machine.
- **`describe('GET /observability/health')`** — asserts schema conformance, that `dependencies.*.status` uses the four-word vocabulary (`ready`/`connecting`/`unavailable`/`disabled`), that `status` is the honest fold, that `analytics` names *and* reports deliverability, that `queues` is an array (empty here), and that a seeded lease document is reflected in `jobs`.
- **`describe('GET /observability/metrics/overview')`** — asserts the full counter shape is present even for rows no module in this build owns (e.g. `business.checkoutSuccess` is `0`, not missing), and that `auth.loginSuccess` is > 0 after the suite's logins.
- **`describe('GET /observability/audit')`** — asserts empty-log and filtered-log shapes, pagination meta (`totalItems`, `totalPages`, `pageSize`), and the 422 contract for out-of-range `pageSize`, unparseable `since`, date-only `since`, and invalid `outcome`.
- **Truncated SSE block** — reads `GET /events` up to the first event to assert its frame shape; full stream semantics live in `stream.test.ts`.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`@tests/contract`) that registers schema assertions into the `api()` helper so every response is automatically validated against the OpenAPI spec.
- **`tests/support/http.ts`** — provides `api()` (supertest wrapper), `authenticateAs()`, and `loginCompleting()` used for every request in this file.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to guarantee a live Mongo connection before any test runs.
- **`tests/support/eventually.ts`** — provides `eventually()`, which powers the `pollUntilAudited` helper to tolerate the fire-and-forget audit write.
- **`tests/support/cookies.ts`** — provides `setCookie`, used in the SSE/auth section.
- **`src/modules/users/tests/factories.ts`** — provides `createAdminUser`, `createUser`, `PLAIN_PASSWORD` to seed the users the auth setup references.
- **`src/infrastructure/persistence/lease.ts`** — this file imports `leaseModel` from it; the health test calls `leaseModel.create(...)` to write a real document so it can confirm `jobs` reads the collection rather than returning a hard-coded `[]`.
- **`src/infrastructure/runtime/database.ts`** — this file imports `connection` from it; the health test asserts `connection.readyState === 1` to prove the snapshot reads a live connection.
- **`src/infrastructure/config/store.ts`** — this file imports `currentEnvironment` from it for environment-conditional assertions.

## Notes

- The audit sink is **fire-and-forget by contract** (`record()` → `void`); the test polls rather than awaiting. This is a deliberate trade-off: making the sink awaitable would change a production property (a Mongo hiccup must not turn a rejected login into a 500) for test convenience.
- Cache and queue `status` values are **not** pinned to a specific state — they depend on whoever's `.env` is running the suite. Only the vocabulary and the `status` fold are asserted.
- `pageSize` has a hard maximum of **100**; exceeding it yields 422, not a silently truncated page.
- `since` must be a full ISO datetime; date-only strings are rejected with 422 to prevent `Invalid Date` from reaching Mongo as a no-op filter.
- The `@tests/contract` import is a **side-effect module** — it has no named exports used here; its job is to monkey-patch the `api()` response handler with schema validation.
