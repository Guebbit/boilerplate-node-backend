---
source: tests/integration/cors.test.ts
sha256: d94deb798c2a18c8b286356279123097a62f6ec556c8c876068f40e7dc8165ae
generated_at: 2026-09-27T15:56:05.341223+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/cors.test.ts

## Purpose

Integration test that pins the app's CORS contract: a disallowed origin must receive a normal response **without** the `Access-Control-Allow-Origin` header, never a 500. It drives the real Express app (full middleware order) via the shared HTTP harness, covering allowed-origin reflection, disallowed-origin omission, no-origin passthrough, preflight short-circuiting, and the specific custom headers (`x-antibot-challenge-token`, `x-analytics-consent`) that must be pre-cleared.

## Key elements

- **`ALLOWED_ORIGIN`** — derived from `process.env.NODE_CORS_ORIGIN` (first CSV entry) with a `http://localhost:8080` fallback. Avoids hardcoding a value that would silently assert the fallback once the env var is set.
- **`DISALLOWED_ORIGIN`** — fixed string `https://evil.example.com`; guaranteed to be absent from any allowlist regardless of environment.
- **`describe('CORS')`** — six tests:
  - *reflects an allowed origin* — 200 + header echoed back.
  - *serves a disallowed origin normally* — 200 + body intact + header **absent**.
  - *does not turn a disallowed origin into a server error on a real endpoint* — `POST /account/login` with bad creds; asserts `< 500` and no allow header.
  - *allows a request that carries no origin* — 200 + no allow header (correct for reflect-mode config).
  - *answers a disallowed preflight* — `OPTIONS` with disallowed origin; asserts `< 500` and no allow header.
  - *allows the antibot and analytics-consent headers through preflight* — `OPTIONS` with `Access-Control-Request-Headers`; asserts both appear in `Access-Control-Allow-Headers`.

## Relationships

- **`tests/support/http.ts`** — imported as `api`; supplies the supertest-style request helper bound to the real app instance. Every test issues requests through `api()`.
- **`tests/support/setup-test-db.ts`** — imported as `setupTestDb`; called once at module top-level to seed/reset the test database before the suite runs.

## Notes

- The file intentionally tests against the **real** middleware chain (not a hand-assembled Express stack), so a regression in middleware *order* (e.g., `cors` positioned after a throwing auth guard) is caught here but would pass in a unit test.
- The "no-origin" test asserts the header is **absent**, not `*`. The config reflects the caller's origin; with none sent there is nothing to reflect. A literal `*` would be wrong (incompatible with `credentials: true`).
- The preflight test for custom headers references two downstream consumers by name: `humanChallengeGate` (`src/infrastructure/http/middlewares/human-challenge.ts`) and `callerContextOf`. If either of those headers stops being pre-cleared, the break is silent (no 4xx), so this test is the only guard.
- `setupTestDb()` runs at import time (module scope), not inside a `beforeAll`, so it executes before Jest's test registration completes for this file.
