---
source: tests/contract/system.test.ts
sha256: 3964ab28c3fbba70270569adfdf58b91c3848d9a419ea2694359bcb15478a54d
generated_at: 2026-10-15T12:34:03.875703+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/system.test.ts

## Purpose

Contract tests for system-level routes (`/`, `/livez`, `/readyz`, `/.well-known/security.txt`) and the shared error-envelope shape (404 / 422). Each assertion pins the status code, body structure, or header that the typed contract promises, so a spec drift is caught as a test failure.

## Key elements

- **`describe('GET /')`** — asserts 200 and `body.data.status === 'ok'` (the `HealthPingEnvelope` shape).
- **`describe('GET /livez')`** — asserts a bare 200.
- **`describe('GET /readyz')`** — two sequential tests: first expects 503 (booting), then calls `markServerListening()` and expects 200 (ready).
- **`describe('GET /.well-known/security.txt')`** — three cases driven by `setEnvironment`: configured (200, `text/plain`, body contains Contact/Expires), expired (404 even with a contact), and unconfigured (404). Cleans up env vars in `afterEach`.
- **`describe('error envelopes')`** — verifies the 404 body (`success: false`, `errors` array) for an unknown route, and a 422 for an invalid `/account/login` payload.
- **Module-level `setupTestDb()`** — ensures a clean database before any test runs.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`); likely registers schema/contract validators used by the `api` helper or assertion layer.
- **`tests/support/http.ts`** — provides the `api()` function used to issue all HTTP requests in this file.
- **`tests/support/environment.ts`** — provides `setEnvironment()` to inject and clear `NODE_SECURITY_CONTACT` / `NODE_SECURITY_EXPIRES` for the security.txt cases.
- **`src/infrastructure/runtime/readiness.ts`** — provides `markServerListening()`, called mid-suite to transition the server from "booting" to "ready" so the second readyz test sees the 200 path.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called once at import time to prepare the test database.

## Notes

- The file header documents a real spec fix: `GET /` was originally typed as `MessageResponse` but returned `data: { status: 'ok' }`; after hardening it is now typed `HealthPingEnvelope`.
- The readyz "booting" test relies on the fact that `src/app.ts`'s auto-start never fires under `NODE_ENV=test`, so the process stays in the booting phase until `markServerListening()` is explicitly called. Test ordering within the `describe` block is therefore load-bearing.
- `setEnvironment` is used both to set values and to clear them (passing `undefined`); the `afterEach` in the security.txt block prevents cross-test leakage.
