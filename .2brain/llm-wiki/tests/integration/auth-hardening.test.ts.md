---
source: tests/integration/auth-hardening.test.ts
sha256: 1c7f4fcfea55beb36c886df88afc68aec1ae9b0811a90dafc20095a68c6ecbf1
generated_at: 2026-10-29T06:52:15.274817+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/auth-hardening.test.ts

## Purpose

Integration suite for the **global Express error handler** (`handleUncaughtError`). It verifies, over real HTTP via `supertest`, that unauthenticated callers never see implementation details (connection strings, filesystem paths, upstream status) and that the handler's status-code / `expose`-flag contract holds for every class of throw that can unwind through it. It lives at the root test level because the error handler is system-wide, not module-scoped.

## Key elements

- **`answerFor(thrown)`** – Private helper that builds a minimal Express app whose single route `throws` the given value, mounts `handleUncaughtError`, and returns the `supertest` request. This is the only way to exercise the handler as Express actually dispatches to it.
- **`describe('the 500 handler')`** – The single suite. Individual tests cover:
  - No secret leakage from an arbitrary thrown `Error` (asserts 500, stable `INTERNAL_SERVER_ERROR` code, truthy translated message).
  - A genuine `express.json` size-exceeded rejection returns 413 / `CONTENT_TOO_LARGE`.
  - `expose: false` + a 4xx status on the error → still 500.
  - `expose: true` + a 5xx status on the error → still 500, message not leaked.
  - `MulterError` translation: `LIMIT_FILE_SIZE` → 413, `LIMIT_FIELD_VALUE` → 413, `LIMIT_FILE_COUNT` → 400, with a `t('generic.error-upload-refused')` message and optional `details.field`.

## Relationships

- **`src/app/error-handling.ts`** – Source of `handleUncaughtError`, the sole system under test. The test imports it directly and mounts it as an Express middleware.
- **`src/infrastructure/i18n/index.ts`** – Exports the `t` function used in assertions to confirm the translated message key (`generic.error-upload-refused`) appears in the Multer response body.
- **`src/infrastructure/i18n/context.ts`** – Underlying provider behind `t`; not imported directly by this file but part of the i18n resolution chain that makes `t` return the expected string.

## Notes

- Do **not** confuse this file with `src/modules/account/tests/integration/auth-hardening.test.ts`; that file covers the account module's rate-limiter and antibot gate. This file is strictly the global 500 handler.
- The body-parser test intentionally drives `express.json` with a real oversize payload rather than hand-assigning `.status` on an `Error`. This guards against the handler reading fields the parser doesn't actually set.
- `multer` is imported with `await import('multer')` inside the test (dynamic import) rather than a top-level `import`, keeping the module optional for other test runs.
