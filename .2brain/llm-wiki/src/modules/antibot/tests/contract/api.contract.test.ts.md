---
source: src/modules/antibot/tests/contract/api.contract.test.ts
sha256: 0fec1948d095c0f296cb8688862c66183120967e5933762eb81e71f0379ac1c7
generated_at: 2026-10-29T03:12:18.103874+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/antibot/challenge` and `/antibot/config` endpoints, plus an end-to-end proof that selecting a provider actually gates a downstream route (`POST /tickets`). The E2E gate case lives here rather than in the tickets suite because `antibot` is the only module that understands both the client-facing challenge and the token-validation side without importing the guarded routes.

## Key elements
- **`describe('GET /antibot/challenge')`** — three cases: 200 with a self-hosted provider (altcha), 404 when no provider is set (default), 404 for a vendor-hosted provider (turnstile) that issues its own challenges.
- **`describe('GET /antibot/config')`** — five cases covering: all rungs off (default shape), publishing provider name + public parameters (site key), publishing rung-2 email-policy posture alongside rung-3 provider, 500 on unknown provider name, 500 on unknown email policy (no silent fallback).
- **`describe('the gate it guards, end to end on one guarded route')`** — two cases on `POST /tickets`: 201 when provider is `none`, 403 when a provider (turnstile) is selected and no token is supplied.
- **`setEnvironment`** — per-case env mutation (provider, altcha secret, turnstile site key, email policy) that must be restored after each case so other suites see a clean state.
- **`setupTestDb()`** — ensures the in-memory/ephemeral DB is ready before any test runs.
- **`api()`** — returns a preconfigured HTTP client (supertest-style) pointed at the test server.

## Relationships
- **`tests/support/contract.ts`** — side-effect import (`@tests/contract`); sets up shared contract-test conventions or assertions the suite relies on.
- **`tests/support/environment.ts`** — exports `setEnvironment`, used to swap `NODE_ANTIBOT_*` variables per case.
- **`tests/support/http.ts`** — exports `api`, the HTTP client used for every request in this file.
- **`tests/support/setup-test-db.ts`** — exports `setupTestDb`, called once at module scope to prepare the test database.

## Notes
- Environment variables are **mutated in-place** via `setEnvironment` inside each `it`; the file's own comments warn that the selected rungs and secrets must be restored for other suites. There is no explicit `afterEach` reset visible here — restoration is expected to be handled by the test runner or the `environment` helper.
- The 500-on-unknown-provider/policy cases encode an intentional "fail loud, don't fall back" contract; adding a fallback would silently break these assertions.
- The E2E gate section deliberately does **not** assert on the shape of the 403 body — it only verifies that the route is refused. Full token-validation contracts are presumably covered elsewhere.
