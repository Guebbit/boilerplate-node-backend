---
source: tests/integration/cors.test.ts
sha256: c013ca1673f7811ac0d54d8e0984ab0ef7e16cfcb0cf8f5f697566688d9afebc
generated_at: 2026-09-23T20:04:18.663647+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/cors.test.ts

## Purpose

Integration test that pins the app's CORS behavior for disallowed origins: the `Access-Control-Allow-Origin` header must be **omitted**, never replaced with a 500. It drives the real Express app (correct middleware order, real `cors` package callback) through the shared HTTP harness to catch the class of bug where a rejected origin throws into the error chain and turns a valid request into a generic server fault.

## Key elements

- **`ALLOWED_ORIGIN`** – First entry of `NODE_CORS_ORIGIN` (or the `http://localhost:8080` fallback). Read from env at test time so the assertion tracks the configured allowlist in `src/app/security.ts` rather than a hardcoded value.
- **`DISALLOWED_ORIGIN`** – Hardcoded `https://evil.example.com`; chosen to be impossible in any real deployment.
- **`describe('CORS')`** – Five specs:
  - *Reflects an allowed origin* – 200 + header echoed back.
  - *Serves a disallowed origin normally* – 200, body intact, header absent.
  - *Does not turn a disallowed origin into a server error* – `POST /account/login` with wrong credentials returns < 500 regardless of Origin.
  - *Allows a request with no origin* – curl/healthcheck path; no header (nothing to reflect).
  - *Answers a disallowed preflight without error* – `OPTIONS` short-circuited by `cors` before the router; asserts < 500 and no allow header.

## Relationships

- **`tests/support/http.ts`** (`@tests/http`) – Provides `api()`, the supertest-style client bound to the real app instance. Every request in this file goes through it.
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) – `setupTestDb()` is called once at module scope to seed/reset the test database before any spec runs.

## Notes

- The file header documents *why* omission is correct: calling `callback(new Error(...))` in the `cors` package signals a request failure to Express, which 500s before the route executes. This is the regression the suite guards against.
- `ALLOWED_ORIGIN` is intentionally **not** hardcoded; a fixed string would silently test the fallback whenever `NODE_CORS_ORIGIN` is set, passing for the wrong reason.
- The preflight test matters because `cors` intercepts `OPTIONS` before the router, so a thrown error there never reaches a route handler—making it easy to overlook in route-level tests.
- See `docs/tools/security.md` for the broader security policy context.
