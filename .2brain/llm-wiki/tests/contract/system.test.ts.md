---
source: tests/contract/system.test.ts
sha256: 97ec9416e543c24f12d55c36518513eb0686324dca3aab000ba45d14fd0083fb
generated_at: 2026-11-08T09:21:33.938885+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/system.test.ts

## Purpose

Contract tests that assert the exact response shape, status code, and content-type of system-level routes (`/`, `/livez`, `/readyz`, `/.well-known/security.txt`) and the shared error envelopes (404, 422). These tests lock down the public API contract for infrastructure endpoints so that implementation changes cannot silently break downstream consumers.

## Key elements

- **`setupTestDb()`** — called once at module scope to prepare a test database before any test runs.
- **`GET /`** — asserts `200` with body `{ status: 'ok' }` (the `HealthPing` contract).
- **`GET /livez`** — asserts `200` with an empty body.
- **`GET /readyz`** — a single test case that first asserts `503` (booting phase), then calls `markServerListening()` and asserts `200` (ready phase). Both responses have empty bodies.
- **`GET /.well-known/security.txt`** — three cases:
  - Configured (contact + future expiry) → `200`, `text/plain`, body contains `Contact:` and `Expires:` lines.
  - Expired (`Expires` in the past) → `404` even when a contact is set.
  - Unconfigured → `404`.
  - `afterEach` resets `NODE_SECURITY_CONTACT` and `NODE_SECURITY_EXPIRES` to `undefined`.
- **`error envelopes`** — two cases:
  - Unmatched route → `404`, `application/problem+json`, body matches `{ type: 'about:blank', title: 'Not Found', status: 404 }` with an `errors` array.
  - Invalid payload to `POST /account/login` → `422`.

## Relationships

- **`src/infrastructure/runtime/readiness.ts`** — exports `markServerListening`, which the `/readyz` test calls to transition the server from `booting` to `ready` mid-test.
- **`tests/support/contract.ts`** — imported as a side-effect (`@tests/contract`); likely registers shared contract-test matchers or globals.
- **`tests/support/environment.ts`** — exports `setEnvironment`, used to inject `NODE_SECURITY_CONTACT` / `NODE_SECURITY_EXPIRES` and reset them in `afterEach`.
- **`tests/support/http.ts`** — exports `api()`, the HTTP client helper used by every test to issue requests against the running server.
- **`tests/support/setup-test-db.ts`** — exports `setupTestDb`, called once at the top of the file to initialize the test database.

## Notes

- The `/readyz` test is deliberately **one** `it()` block (booting → ready) rather than two separate cases. The readiness phase is monotonic (only moves forward), and `src/app.ts`'s auto-start does not fire under `NODE_ENV=test`, so the process always begins in `booting`. Two separate cases would only pass in file order and would be misleading.
- The `security.txt` test mutates process-level environment variables via `setEnvironment`; the `afterEach` cleanup is critical to prevent cross-test pollution.
- The 422 error-envelope case reuses `POST /account/login` with a malformed email purely to trigger a validation failure; it does not test the login logic itself.
