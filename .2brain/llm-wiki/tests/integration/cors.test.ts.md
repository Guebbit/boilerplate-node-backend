---
source: tests/integration/cors.test.ts
sha256: cece19dfc46625ebe2c307391b9b3049086909777f6fc3a3fdebca34ec9f9929
generated_at: 2026-10-15T12:46:51.802865+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/cors.test.ts

## Purpose

Integration tests that pin the app's CORS contract end-to-end through the real middleware stack. The core property under test: a disallowed origin is handled by **omitting** the `Access-Control-Allow-Origin` header, never by throwing into Express's error chain (which would turn a valid request into a 500 and let an attacker drive 5xx rates). Also verifies `Vary` correctness, preflight behavior, and that specific custom headers (`x-antibot-challenge-token`, `x-analytics-consent`, `If-Match`, `ETag`) pass through preflight and exposure as the browser requires.

## Key elements

- **`ALLOWED_ORIGIN`** — first entry of `NODE_CORS_ORIGIN` (comma-split) or the fallback `http://localhost:8080`. Read from the environment so the test asserts the configured allowlist, not the hardcoded default.
- **`DISALLOWED_ORIGIN`** — `'https://evil.example.com'`, an origin no deployment would allow.
- **`describe('CORS')`** — single suite, 8 tests covering:
  - Allowed origin is reflected; disallowed origin gets 200 + no allow header.
  - `Vary: Origin` is present for allowed, disallowed, and no-origin requests, and appears exactly once (deduplication between the app and the `cors` package).
  - `POST /account/login` with wrong credentials still returns its own rejection status (not 500) regardless of origin.
  - No-origin requests (curl, healthcheck, server-to-server) are untouched.
  - Disallowed preflight (`OPTIONS`) returns non-5xx without the allow header.
  - Preflight allows `x-antibot-challenge-token` and `x-analytics-consent`.
  - Preflight allows `If-Match`; response exposes `ETag`.

## Relationships

- **`tests/support/http.ts`** — provides `api()`, the supertest wrapper that drives the real, fully-assembled Express app (correct middleware order, real routes).
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called once at module top to provision the test database before any test runs.
- References (not imports): `src/app/security.ts` (the allowlist `ALLOWED_ORIGIN` mirrors), `src/infrastructure/http/middlewares/human-challenge.ts` (reads `x-antibot-challenge-token`), `docs/tools/security.md`.

## Notes

- The file header documents the **reason** the test exists: the `cors` package's callback, when called with an `Error`, signals request failure to Express rather than "origin not allowed," which would short-circuit before the route and produce a generic 500. This test guards against that regression.
- `ALLOWED_ORIGIN` is deliberately derived from the env var. Hardcoding the fallback would make the test silently pass for the wrong reason in any checkout that sets `NODE_CORS_ORIGIN`.
- The `Vary: Origin` deduplication test exists because both the app and the `cors` package add it; a double entry would break cache-key discrimination.
- The preflight tests note that `cors` short-circuits `OPTIONS` before the router, so a throw in the callback never reaches a route — which is why the original bug went unnoticed.
- The no-origin test explicitly states that the absence of `Access-Control-Allow-Origin` is **correct** (nothing to reflect), not a second bug, and that a literal `*` must never appear (incompatible with `credentials: true`).
