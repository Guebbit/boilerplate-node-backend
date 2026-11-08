---
source: src/app/error-handling.ts
sha256: 7c130745c265d438bd5c7ff338ea5f28a286ad73570f40c4f16fc767d6da2777
generated_at: 2026-11-08T03:13:08.598261+00:00
model: ollama:qwen3.8:27b
---

# src/app/error-handling.ts

## Purpose

The global Express error handler plus the two process-level error listeners (`unhandledRejection`, `uncaughtException`). It answers one question at two levels—inside a request and outside one—by resolving a status, logging a redacted error, and sending a constant client response that never forwards library-generated messages.

## Key elements

- **`handleUncaughtError`** (exported) — The Express error middleware. Normalises non-Error throws, resolves a status, records the error on the active OTel span, logs at `error` (5xx) or `warn` (4xx) with a redacted payload, then responds: Multer → translated 413/400 item, 503 → `rejectServiceUnavailable`, other 5xx → constant 500, everything else → constant client-error shape.
- **`handleUnhandledRejection`** (exported) — Increments the `processUnhandledRejectionsTotal` metric and audit-logs the raw reason. Does **not** exit; the process keeps running.
- **`installErrorHandling(app)`** (exported) — Mounts `handleUncaughtError` on the Express app and registers the two `process.on` listeners. Skips the process-level listeners entirely when `isTestEnvironment()` is true so Jest's own handlers remain in control.
- **`resolveStatus(error)`** (internal) — Priority chain: Multer byte-limit → 413 / other Multer → 400; declared `http-errors` contract (`expose` + 4xx); `databaseErrorInterpreter` fallback.
- **`clientErrorStatus(error)`** (internal) — Reads `expose === true` and a 4xx `status`/`statusCode` without hard-coding error `type` strings.
- **`loggableError(error, declaredClientError)`** (internal) — Returns a stripped object safe for logs: body-parser errors → `{type}` only; Mongo/Mongoose errors → `{name, code}` only; everything else → the raw error (relying on the logger's `redactFormat`).
- **`DATABASE_ERROR_NAME`** (internal) — Regex matching Mongo/Mongoose/BSON error `name` values (avoids `instanceof` because duplicate transitive deps can break it).
- **`MULTER_SIZE_LIMIT_CODES`** (internal) — `Set` of Multer `code` strings that indicate a byte-size violation (→ 413) versus all other Multer limits (→ 400).

## Relationships

- **`src/app.ts`** — Calls `installErrorHandling(app)` after all routes are registered; the handler only catches errors from middleware/routes mounted before it.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger` and `auditLogger`; its `redactFormat` serialises `Error` objects to `{name, message, stack}`, which is why this file passes raw errors rather than hand-picked fields.
- **`src/infrastructure/http/errors.ts`** — Supplies `databaseErrorInterpreter` (status + interpretation for Mongo/Mongoose errors) and `rejectServiceUnavailable`.
- **`src/infrastructure/http/response.ts`** — Supplies `fieldError` (one-field error item shape) and `rejectResponse` (sends a constant code + copy derived from the status).
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Provides `t()` for the single translated client-facing message (Multer upload refusal).
- **`src/infrastructure/observability/tracer.ts`** — `recordErrorOnActiveSpan` attaches the error to the current span; `getActiveSpanContext` supplies the `traceId` for log correlation.
- **`src/infrastructure/observability/metrics-process.ts`** — `processUnhandledRejectionsTotal` Prometheus counter incremented per unhandled rejection.
- **`src/infrastructure/runtime/config.ts`** — `isTestEnvironment()` gates process-level listener registration.
- **`tests/unit/app/error-handling.test.ts`** — Unit tests driving `handleUncaughtError` and `resolveStatus` directly.
- **`tests/integration/…`** (auth-hardening, session-failure, demo-routes, lost) — Integration tests that exercise the handler through real request/response cycles.

## Notes

- **Mount order is mandatory.** `installErrorHandling` must be called *after* `installRoutes`; Express error middleware only catches what was registered before it. Calling it first means it catches nothing.
- **The 500 body is a constant.** `error.message` is never forwarded to the client. The only translated string sent to a client is the Multer upload-refusal message.
- **Test environment suppresses process listeners.** In Jest, `unhandledRejection` and `uncaughtException` handlers are not registered so the test runner can attribute failures to the correct test case.
- **`expose` + 4xx is the only "client error" gate.** The code deliberately does not branch on `error.type` strings; a new body-parser shape is handled automatically as long as it sets `expose: true` and a 4xx status.
- **Stryker mutation suppression.** The `logger[…](…)` call is wrapped in `Stryker disable/restore all` to prevent meaningless mutations of the log-level ternary.
- **`response.headersSent` guard.** If headers have already been written, the handler delegates to `next(error)` rather than attempting a second response, preventing a half-open stream.
