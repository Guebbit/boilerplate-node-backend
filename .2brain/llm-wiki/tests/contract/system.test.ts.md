---
source: tests/contract/system.test.ts
sha256: 144a31fc17114b5bdd76802ca995d623e4c87eb4f1a71974edb4c71db52d8c86
generated_at: 2026-09-27T15:48:35.516295+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/system.test.ts

## Purpose

Contract tests that verify system-level routes (`GET /`, `GET /readyz`) and shared error envelopes (404, 422) return responses matching their declared shapes. Exists to catch drift between the actual HTTP responses and the response types defined in the API spec.

## Key elements

- **`describe('GET /')`** — asserts the root health endpoint returns `200` with `body.data.status === 'ok'`.
- **`describe('GET /readyz')`** — two ordered tests: first asserts `503` (booting phase), then calls `markServerListening()` and asserts `200` (ready phase).
- **`describe('error envelopes')`** — asserts the 404 body has `success: false` and an `errors` array; asserts `POST /account/login` with an invalid email returns `422`.
- No exports; the file is a pure test suite.

## Relationships

- **`src/infrastructure/runtime/readiness.ts`** — imports `markServerListening`, called mid-suite to flip the readiness state from *booting* to *ready* between the two `/readyz` tests.
- **`tests/support/contract.ts`** — imported for side effects (likely registers contract-aware matchers or global test setup).
- **`tests/support/http.ts`** — imports the `api` helper used to issue HTTP requests against the in-process test server.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb`; called once at module load to provision a test database before any test runs.

## Notes

- **Order dependency within `/readyz`:** the `503` test must run before the `200` test because `markServerListening()` mutates shared state. This relies on Jest's top-to-bottom `it` execution order within a `describe` block.
- **`NODE_ENV=test` suppresses auto-start:** `src/app.ts`'s auto-start logic never fires in the test process, so the server stays in the *booting* phase until a test explicitly calls `markServerListening()`. This is what makes the `503` assertion deterministic.
- **Historical type fix (documented in file header):** `GET /` was previously typed as `MessageResponse` while actually returning `data: { status: 'ok' }`. The spec was corrected to `HealthPingEnvelope` when the contract was hardened.
