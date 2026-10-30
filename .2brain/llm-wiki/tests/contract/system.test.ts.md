---
source: tests/contract/system.test.ts
sha256: 97ec9416e543c24f12d55c36518513eb0686324dca3aab000ba45d14fd0083fb
generated_at: 2026-10-29T06:41:15.610819+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/system.test.ts

## Purpose

Contract tests for system-level routes (`/`, `/livez`, `/readyz`, `/.well-known/security.txt`) and the shared error-document shape. Verifies that each endpoint returns the expected status code, content type, and body structure regardless of internal implementation.

## Key elements

- **`setupTestDb()`** (module-level) — initialises the test database before any test runs.
- **`describe('GET /')`** — asserts 200 and `{ status: 'ok' }` body (the `HealthPing` contract).
- **`describe('GET /livez')`** — asserts 200 with an empty body.
- **`describe('GET /readyz')`** — single combined case: first asserts 503 while the process is in 'booting', then calls `markServerListening()` and asserts 200. Both responses have an empty body.
- **`describe('GET /.well-known/security.txt')`** — three cases covering configured (200, `text/plain`), expired (`Expires` in the past → 404 even with a contact set), and unconfigured (404). Env vars are reset in `afterEach`.
- **`describe('error envelopes')`** — asserts the 404 problem+json shape (`type`, `title`, `status`, `errors[]`) for an unmatched route, and 422 for an invalid `POST /account/login` payload.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`import '@tests/contract'`); likely registers global matchers or contract assertion helpers used by the test bodies.
- **`tests/support/http.ts`** — provides the `api()` helper used to issue HTTP requests against the running test server.
- **`tests/support/environment.ts`** — provides `setEnvironment()`, used to set/clear `NODE_SECURITY_CONTACT` and `NODE_SECURITY_EXPIRES` around the security.txt cases.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called once at module load to prepare a clean test database.
- **`src/infrastructure/runtime/readiness.ts`** — provides `markServerListening()`, which advances the runtime readiness phase from 'booting' to 'ready' so the `/readyz` test can observe both states in a single case.

## Notes

- The `/readyz` test is deliberately **one** `it` block rather than two. Under `NODE_ENV=test` the auto-start in `src/app.ts` never fires, so the process begins in 'booting' and the phase only moves forward. Splitting into separate cases would create a hidden ordering dependency (the second case would 404-503-fail if run first).
- The `import '@tests/contract'` line has no named binding — it is purely for side effects.
- `setupTestDb()` executes at import time (top of module), not inside a `beforeAll` hook, so it is guaranteed to run before any `describe`/`it` block registers.
- The 404 error-envelope test checks for `application/problem+json` (RFC 7807), not plain `application/json`.
