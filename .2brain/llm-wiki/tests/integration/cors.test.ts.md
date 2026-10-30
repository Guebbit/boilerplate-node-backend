---
source: tests/integration/cors.test.ts
sha256: 8b1dfe69cf48c481ebb3d0bcd70ee58c43eba019d6157512d75e4c5b4c57d78a
generated_at: 2026-10-29T06:54:21.323555+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/cors.test.ts

## Purpose

Integration test that pins the CORS security property: a disallowed origin is rejected by **omitting** the `Access-Control-Allow-Origin` header, never by failing the request (which would turn a valid call into a generic 500 and let anyone drive 5xx rate). Drives the real app through the shared HTTP harness so assertions cover the actual middleware order.

## Key elements

- **`ALLOWED_ORIGIN`** — First entry of `process.env.NODE_CORS_ORIGIN` (comma-split), falling back to `http://localhost:8080`. Read from the environment to stay in sync with whatever the app is actually configured with.
- **`DISALLOWED_ORIGIN`** — Hardcoded `https://evil.example.com`, an origin no deployment could plausibly have allowed.
- **`describe('CORS', …)`** — Suite of tests covering:
  - Allowed origin reflected back with 200.
  - Disallowed origin still gets 200 + `status: 'ok'` but **no** `access-control-allow-origin` header.
  - `Vary: Origin` present for allowed, disallowed, and no-origin requests; and exactly **once** (not duplicated by `cors` + app).
  - Disallowed origin on `POST /account/login` returns a real rejection (< 500), not a server fault.
  - No-origin requests (curl, healthcheck) pass through with no allow header.
  - Disallowed preflight (`OPTIONS`) answers without error and without the allow header.
  - Preflight pre-clears `antibot-challenge-token`, `analytics-consent`, and `session-passive` headers.
  - Preflight allows `if-match`; read responses expose `etag` via `access-control-expose-headers`.
  - Credentialed expose-headers include `location`, `content-disposition`, `idempotent-replay`, `ratelimit`, `ratelimit-policy`; explicitly **excludes** `cache-status`.

## Relationships

- **`tests/support/http.ts`** — Provides `api()`, the shared harness that builds supertest-style requests against the running app. Every assertion in this file goes through it.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb()`, called once at module top to initialize the test database before any test runs.

## Notes

- `ALLOWED_ORIGIN` intentionally reads the environment rather than hardcoding a value; a hardcoded origin would silently pass against the env-configured fallback, asserting the wrong thing.
- The "exactly one `Vary: Origin`" test exists because the `cors` package adds it on reflection while the app adds it unconditionally — a regression that duplicates the value would break proxy caching.
- `Cache-Status` is deliberately absent from `access-control-expose-headers`; it is a devtools/curl diagnostic (RFC 9211 §6) and must stay invisible to cross-origin JS.
- The preflight header tests reference concrete consumers: `humanChallengeGate` (`src/infrastructure/http/middlewares/human-challenge.ts`), `callerContextOf`, and the session guard. Removing any of those headers from the allowlist silently breaks the browser without surfacing a 4xx.
