---
source: tests/integration/auth-hardening.test.ts
sha256: daa23559fe6d4537450080d06182f31ca2af19f929c2e1a6568c09584ab1c39f
generated_at: 2026-09-27T15:54:50.147795+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/auth-hardening.test.ts

## Purpose

Integration suite for the global Express error handler (`handleUncaughtError`), exercising it over real HTTP via supertest. It verifies that the handler's translation of arbitrary thrown values into safe, structured JSON responses never leaks internal details, correctly maps genuine library rejections (body-parser, Multer) to their intended status and code, and enforces the `expose`-flag contract in both directions. The file exists at the root level because the global handler is system-wide—every module's uncaught throw unwinds through it.

## Key elements

- **`answerFor(thrown: unknown)`** — Helper that builds a throwaway Express app, registers a `/boom` route that synchronously throws the given value, mounts `handleUncaughtError` as the error middleware, and returns the pending supertest request. Testing the mount + route-dispatch path (not just the function in isolation).
- **`describe('the 500 handler')`** — Contains five tests:
  - *No secret leakage*: a thrown `Error` with a connection string must produce `500 / INTERNAL_ERROR` without echoing the original message.
  - *Genuine body-parser rejection*: drives `express.json({ limit: '100b' })` with an oversized payload; expects `413 / PAYLOAD_TOO_LARGE` using the fields body-parser actually sets.
  - *`expose: false` with a 4xx status*: handler must return `500`, ignoring the thrower's `status`.
  - *`expose: true` with a 5xx status*: handler must still return `500` and suppress the message.
  - *MulterError translation*: the one remaining hand-rolled case—expects `400` and the human-readable `'File too large'` message.

## Relationships

- **`src/app/error-handling.ts`** — Imports and exercises `handleUncaughtError`, the sole SUT. All assertions are about the shape and status of that function's HTTP output.

## Notes

- The file's name still says "auth-hardening," but the rate-limiter and antibot-challenge tests it once carried now live in `src/modules/account/tests/integration/auth-hardening.test.ts`. Only the global error handler remains here.
- Tests that involve a specific library (body-parser, Multer) are mounted in their own Express instance to produce a *real* rejection shape rather than hand-assigning `.status` on an `Error`. This prevents tautological assertions.
- The `answerFor` helper deliberately tests that Express routes a synchronous throw to the error middleware—dropping the middleware would change the response, so the mount is part of the contract under test.
