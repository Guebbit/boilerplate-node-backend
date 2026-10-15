---
source: tests/integration/auth-hardening.test.ts
sha256: 848880b52c0ed183543f2288260550b548aed586c31dfd844d99e72035dbc55e
generated_at: 2026-10-15T12:43:44.650489+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/auth-hardening.test.ts

## Purpose

Integration suite that exercises the **global Express error handler** (`handleUncaughtError`) over real HTTP via supertest. It verifies that the handler sanitises unexpected 500s, honours body-parser rejections, respects the `expose` flag correctly, and passes through deliberate client-facing errors. It lives at the repo root (not inside any module) because the handler is system-wide — every uncaught throw and body-parser rejection in every module funnels through it.

## Key elements

- **`answerFor(thrown: unknown)`** — helper that mounts a throwing route and `handleUncaughtError` on a throwaway Express app, then issues a GET via supertest. Used for the "thrown value" test cases.
- **`describe('the 500 handler')`** — single suite containing five tests:
  - *tells the client nothing about what actually threw* — asserts a 500 with `INTERNAL_ERROR` code, and that a planted Mongo URI (host, password) does not appear in the body.
  - *answers a genuine oversized-body rejection with its own status* — drives `express.json({ limit: '100b' })` to produce a real body-parser rejection; expects 413 / `PAYLOAD_TOO_LARGE`.
  - *ignores a client status on an error that does not expose itself* — `status: 400, expose: false` is coerced to 500.
  - *does not hand a 5xx back to the client just because it is exposed* — `status: 503, expose: true` is still coerced to 500 and the message is stripped.
  - *still returns the copy a deliberate error carries* — a `MulterError('LIMIT_FILE_SIZE')` passes through as 400 with its own message.

## Relationships

- **`src/app/error-handling.ts`** — the sole import. Provides `handleUncaughtError`, the Express error middleware under test. The tests mount it on throwaway apps and assert on the shape of the JSON responses it produces; they do not mock or stub it.

## Notes

- The file's header comment explicitly states that the **credential-endpoint rate limiter** and **antibot challenge gate** tests live in `src/modules/account/tests/integration/auth-hardening.test.ts`, not here. Do not conflate the two files when searching for hardening coverage.
- The MulterError test uses a dynamic `await import('multer')` rather than a top-level import, keeping the dependency optional for the rest of the suite.
- The `expose`-flag tests together encode the full policy: **4xx + expose:false → 500**, **5xx + expose:true → 500**. The only errors that keep their own status are those the handler explicitly translates (currently MulterError and body-parser).
- The "genuine body-parser rejection" test intentionally does **not** hand-set `.status` on a fake error; it drives the real parser to avoid tautological assertions.
