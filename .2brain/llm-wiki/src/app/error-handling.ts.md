---
source: src/app/error-handling.ts
sha256: e77b18c993da428891c4b3c396728a4a3b4c6decdfb90e636adee7182198b773
generated_at: 2026-10-01T12:44:47.053113+00:00
model: ollama:qwen3.8:27b
---

# src/app/error-handling.ts

## Purpose

The global Express error handler and the process-level (`unhandledRejection`, `uncaughtException`) handlers. It is the last safety net for any failure that no controller caught, answering two questions: what does the client see, and what gets logged / recorded in the trace. It is mounted after all routes so it only receives errors that propagated past every `try/catch` in the request path.

## Key elements

- **`handleUncaughtError`** (exported) — Express error-middleware. Resolves the status, logs (error-level for 5xx, warn for 4xx), records the error on the active OTel span, and sends a constant i18n response. Multer errors are the sole exception: their own `code`/`message` are forwarded. A 503 delegates to `rejectServiceUnavailable`.
- **`installErrorHandling`** (exported) — Mounts `handleUncaughtError` on the Express app, then (outside test env) registers `process.on('unhandledRejection')` and `process.on('uncaughtException')` handlers that audit-log and, for the latter, call `process.exit(1)`.
- **`resolveStatus`** (internal) — Priority chain: `MulterError` → declared `http-errors` 4xx status → `databaseErrorInterpreter`. Returns a single number used by both the log line and the response.
- **`clientErrorStatus`** (internal) — Reads `expose === true` plus `status`/`statusCode` from an unknown error object without a type guard, returning the 4xx or `undefined`.
- **`CLIENT_ERROR_COPY`** (internal) — Constant `{code, messageKey}` map for 400 / 413 / 415. Unknown 4xx statuses fall back to a generic `INVALID_REQUEST` entry.

## Relationships

- **`src/app.ts`** — Calls `installErrorHandling(app)` after `installRoutes`; ordering is mandatory because Express error handlers only catch middleware mounted before them.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` is the sole way this file writes an error response.
- **`src/infrastructure/http/errors.ts`** — `databaseErrorInterpreter` classifies driver-level failures; `rejectServiceUnavailable` handles the 503 branch.
- **`src/infrastructure/adapters/logger.ts`** — `logger` for request-scoped errors, `auditLogger` for process-level events. Relies on its `redactFormat` to serialise raw `Error` objects safely.
- **`src/infrastructure/observability/tracer.ts`** — `recordErrorOnActiveSpan` attaches the error to the current span; `getActiveSpanContext().traceId` is included in log metadata.
- **`src/infrastructure/i18n/index.ts`** — `t()` resolves the constant `messageKey` strings into the client's locale.
- **`src/infrastructure/runtime/config.ts`** — `isTestEnvironment()` gates the process-level handlers so Jest can capture rejections itself.
- **`tests/unit/app/error-handling.test.ts`** / **`tests/unit/app/process-error-handlers.test.ts`** — Unit tests for the handler and process handlers respectively.
- **`tests/integration/app/demo-routes.test.ts`** / **`tests/integration/auth-hardening.test.ts`** — Exercise the error paths end-to-end through the mounted handler.

## Notes

- **Never forwards `error.message` to the client** (except MulterError). The response body always uses a constant i18n string; detail lives only in the log line.
- **Test-env gating:** `installErrorHandling` skips registering process-level handlers under a test runner so Jest's own handlers remain effective. The Express error middleware itself is still mounted in tests.
- **`uncaughtException` exits the process** (`process.exit(1)`) after logging — by design, the post-exception state is considered unrecoverable.
- **Stryker mutation testing** is explicitly disabled around the `logger[...]` call to prevent mutants from altering log level logic.
- **Multer is the only error shape whose own copy is forwarded** to the client; its messages are considered end-user-safe and name no internals.
