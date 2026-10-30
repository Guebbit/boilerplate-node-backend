---
source: src/app/error-handling.ts
sha256: 7c130745c265d438bd5c7ff338ea5f28a286ad73570f40c4f16fc767d6da2777
generated_at: 2026-10-29T01:50:09.087851+00:00
model: ollama:qwen3.8:27b
---

# src/app/error-handling.ts

## Purpose

Central global error handler for the Express app plus the two process-level safety nets (`unhandledRejection`, `uncaughtException`). It exists so that no failure—whether inside a request or outside one—escapes without a deterministic status, a single audit log line, and a span annotation. It is the last stop in the request pipeline and the last stop for the process.

## Key elements

- **`handleUncaughtError(thrown, req, res, next)`** – The 4-arg Express error handler. Normalizes any thrown value to an `Error`, short-circuits if headers are already sent, resolves a status (Multer → declared client error → database interpreter → 500), logs at `warn` or `error` level, records the error on the active OTel span, and sends a constant-body response (never `error.message`). Translates `MulterError` into a localized item list and `503` into the shared service-unavailable shape.
- **`handleUnhandledRejection(reason)`** – Increments `processUnhandledRejectionsTotal` and writes one `auditLogger` line. Deliberately does **not** terminate the process.
- **`installErrorHandling(app)`** – Mounts `handleUncaughtError` via `app.use`, then (unless in a test environment) registers the two `process.on` handlers. Must be called after route installation.
- **`resolveStatus(error)`** *(internal)* – Ordered status resolution: Multer byte-limit → 413, other Multer → 400; declared `expose`+4xx → that status; `databaseErrorInterpreter` → its status; fallback 500.
- **`clientErrorStatus(error)`** *(internal)* – Reads `expose` and `status`/`statusCode` via `in`-narrowing (no cast) to extract a 4xx the thrower declared.
- **`loggableError(error, declared)`** *(internal)* – Returns a stripped object (`{type}` for body-parser, `{name, code}` for DB errors) or the original error, preventing user-controlled or PII-bearing messages from reaching the log.
- **`MULTER_SIZE_LIMIT_CODES`** – Set of Multer `code` values that map to 413 vs. 400.
- **`DATABASE_ERROR_NAME`** – Regex matched against `error.name` to identify Mongo/Mongoose/BSON errors without `instanceof` (avoids dual-package issues).

## Relationships

- **`src/app.ts`** – Calls `installErrorHandling(app)` after route registration; this module is the final `app.use` in the pipeline.
- **`src/infrastructure/adapters/logger.ts`** – Consumes `logger` and `auditLogger`; relies on the adapter's `redactFormat` to serialize `Error` objects into `{name, message, stack}` before JSON output.
- **`src/infrastructure/http/errors.ts`** – Uses `databaseErrorInterpreter` (status + interpretation for driver errors) and `rejectServiceUnavailable` (503 response shape).
- **`src/infrastructure/http/response.ts`** – Uses `rejectResponse` (constant-body error response) and `fieldError` (per-field error item for Multer).
- **`src/infrastructure/observability/tracer.ts`** – Calls `recordErrorOnActiveSpan` and `getActiveSpanContext().traceId` for span annotation and log correlation.
- **`src/infrastructure/observability/metrics-process.ts`** – Increments `processUnhandledRejectionsTotal` Prometheus counter.
- **`src/infrastructure/i18n/index.ts`** – Calls `t()` to translate the Multer refusal message.
- **`src/infrastructure/runtime/config.ts`** – Reads `isTestEnvironment()` to skip process-level handler registration under test runners.
- **`tests/unit/app/error-handling.test.ts`** – Direct unit tests for the three exports.
- **`tests/integration/*`** – Exercises the handler indirectly through full request cycles (auth failures, session failures, demo routes).

## Notes

- **Never logs `error.message` for client errors or DB errors.** `loggableError` strips to `{type}` or `{name, code}`; the headline becomes just `error.name`. This is a deliberate leak-prevention convention.
- **Status resolution order is load-bearing.** Multer → declared client error → database interpreter → 500. Reordering changes which interpretation wins.
- **`installErrorHandling` must run after routes.** An Express error handler only catches errors from middleware/routes mounted before it. Calling it before `installRoutes` silently breaks error handling.
- **Process-level handlers are skipped in test environments** (`isTestEnvironment()`). Under Jest, a registered `unhandledRejection` handler swallows rejections that Jest expects to attribute to the failing test.
- **`uncaughtException` exits with code 1 in every environment.** The reasoning: post-exception process state is unknown. Throwing inside the handler would re-enter it.
- **The client-facing response body is always a constant** derived from the status code. No library-supplied or user-supplied text is forwarded, even when `expose: true` is set.
