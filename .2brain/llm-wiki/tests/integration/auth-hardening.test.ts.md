---
source: tests/integration/auth-hardening.test.ts
sha256: 1c7f4fcfea55beb36c886df88afc68aec1ae9b0811a90dafc20095a68c6ecbf1
generated_at: 2026-11-08T09:35:20.085060+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/auth-hardening.test.ts

## Purpose

Integration tests for the global Express error handler (`handleUncaughtError`), verifying over real HTTP (via supertest) that uncaught throws and body-parser rejections produce safe, translated, correctly-coded responses without leaking internals. It lives at the root integration suite (not under a module) because the handler is system-wide: every module's uncaught error unwinds through it.

## Key elements

- **`answerFor(thrown: unknown)`** — Test helper that builds a minimal Express app with one route that synchronously throws the given value, mounts `handleUncaughtError` as the error middleware, and fires a supertest GET. Exists so the test exercises Express's real routing of sync throws to an error handler, not just a direct call.
- **`describe('the 500 handler')`** block containing:
  - Secret-leakage test: throws an error containing a MongoDB connection string; asserts 500, no secret in body, stable `INTERNAL_SERVER_ERROR` code, and a non-empty translated message.
  - Oversized-body test: drives a real `express.json({ limit: '100b' })` parser with a 500-char payload; asserts 413 and `CONTENT_TOO_LARGE` code.
  - `expose: false` + 4xx status: asserts the handler overrides to 500 / `INTERNAL_SERVER_ERROR`.
  - `expose: true` + 5xx status: asserts the handler still returns 500 and omits the message text.
  - MulterError matrix (`LIMIT_FILE_SIZE`→413, `LIMIT_FIELD_VALUE`→413, `LIMIT_FILE_COUNT`→400): asserts correct status, the translated message via `t('generic.error-upload-refused')`, and a `details.field` entry when a field name is present.
  - MulterError without a field: asserts 400, translated message, and no `details` key.

## Relationships

- **`src/app/error-handling.ts`** — Exports `handleUncaughtError`, the function under test. The test imports it and mounts it as Express error middleware.
- **`src/infrastructure/i18n/index.ts`** — Re-exports the `t` translation function, which the test calls to compute the expected MulterError message string, keeping assertions in sync with the live i18n catalog.
- **`src/infrastructure/i18n/context.ts`** — Source module for the `t` function (re-exported through the index). The test depends on this indirectly for message content.

## Notes

- The oversized-body test deliberately drives a real `express.json` parser rather than hand-constructing an error with `.status` and `.type`, ensuring the fields body-parser actually sets are the fields the handler reads.
- MulterError is imported dynamically (`await import('multer')`) inside the test body, not at the top level.
- The test couples to i18n catalog strings via `t()`; if the `generic.error-upload-refused` key is renamed or removed, these assertions break even if the handler logic is unchanged.
- The doc comment at the top notes that a companion file at `src/modules/account/tests/integration/auth-hardening.test.ts` covers the credential-endpoint rate limiter and antibot gate, which belong to the account module rather than this root-level suite.
