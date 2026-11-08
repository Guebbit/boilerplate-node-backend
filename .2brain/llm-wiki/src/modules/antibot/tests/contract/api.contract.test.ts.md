---
source: src/modules/antibot/tests/contract/api.contract.test.ts
sha256: 00237613ef2322574007b84cf5bae534549bfbda697830e60937781468357e55
generated_at: 2026-11-08T05:00:59.977361+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/tests/contract/api.contract.test.ts

## Purpose

Contract tests for `GET /antibot/challenge` and a short end-to-end proof that a selected anti-bot provider actually gates a guarded route (`POST /tasks`). The E2E gate test lives here (rather than in `tasks`'s own suite) because `antibot` is the one module that understands both sides of the handshake—what the client renders and what counts as a valid token—without importing the routes it guards. `GET /config` is deliberately excluded; it has its own contract test file.

## Key elements

- **`describe('GET /antibot/challenge')`** — three cases:
  - Self-hosted provider (`altcha`) → expects `200`.
  - No provider set (default) → expects `404`.
  - Vendor-hosted provider (`turnstile`) → expects `404` (vendor issues challenges itself).
- **`describe('the gate it guards, end to end on one guarded route')`** — two cases using a fixed `CONTACT_PAYLOAD`:
  - Provider unset → `POST /tasks` returns `202` (untouched).
  - Provider `turnstile` selected → `POST /tasks` returns `403` (refused, no token).
- **`setupTestDb()`** — called once at module scope to seed a clean DB before any test runs.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — side-effect import; likely registers contract-test Jest globals or expectations.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, invoked at module top-level to initialise the test database.
- **`tests/support/http.ts`** — provides the `api` helper used for every HTTP call in the file.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to swap `NODE_ANTIBOT_PROVIDER` / `NODE_ANTIBOT_ALTCHA_SECRET` between individual tests.

## Notes

- Each test calls `setEnvironment` independently; there is no `beforeEach`/`afterEach` reset. Tests are order-dependent on the *absence* of a prior provider value unless they explicitly set `undefined`.
- The `altcha` secret is scoped to this file's comment ("does not leak into other suites"), implying other suites may set their own `NODE_ANTIBOT_ALTCHA_SECRET`.
- The E2E gate test targets `POST /tasks` as a representative guarded route; it does not exercise every route `antibot` protects.
