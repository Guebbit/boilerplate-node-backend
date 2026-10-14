---
source: src/app/error-handling.ts
sha256: a66741b477ffcaf68dcb0b56a215785cba86bc5bb3e9e4be53a2850a272de809
generated_at: 2026-10-14T07:38:11.852300+00:00
model: ollama:qwen3.8:27b
---

# src/app/error-handling.ts

## Purpose

Central error-handling module for the Express application. It provides the global request-level error handler, the process-level `unhandledRejection` / `uncaughtException` handlers, and the single `installErrorHandling` entry point that wires them up. All three exist to answer "what happens to a failure nobody else handled?" at the two levels where that question can be asked: inside a request and outside one.

## Key elements

- **`handleUncaughtError`** (exported) — The Express 4-argument error handler. Normalises non-`Error` throws, resolves a status code, records the error on the active OTel span, logs a sanitised headline at `warn` (4xx) or `error` (5xx), then sends a fixed-copy response via `rejectResponse` or `rejectServiceUnavailable`. For `MulterError` it forwards the library's own user-facing message; for everything else the client receives only a constant code + i18n string.
- **`handleUnhandledRejection`** (exported) — Increments the `processUnhandledRejectionsTotal` metric and writes an audit-log line. Deliberately does **not** terminate the process.
- **`installErrorHandling`** (exported) — Mounts `handleUncaughtError` on the Express app and (outside tests) registers `process.on('unhandledRejection', …)` and `process.on('uncaughtException', …)`. The `uncaughtException` handler logs then calls `process.exit(1)`.
- **`clientErrorStatus`** (private) — Reads the `expose: true` + 4xx `status`/`statusCode` contract used by `http-errors`-compatible libraries (body-parser, etc.) without branching on specific `.type` strings.
- **`CLIENT_ERROR_COPY`** (private) — Map of known client statuses (400, 413, 415) to their `ERROR_CODES` value and i18n message key. Unlisted statuses fall back to `INVALID_REQUEST` / `'generic.error-unknown'`.
- **`resolveStatus`** (private) — Priority chain: `MulterError` → 400; declared client-error status; `databaseErrorInterpreter`. Returns a final HTTP status.
- **`loggableError`** (private) — Strips the raw `message` from client-declared and database errors before logging; passes other errors through to the logger's own `redactFormat` serializer.
- **`DATABASE_ERROR_NAME`** (private) — Regex matching Mongo/Mongoose/BSON error `name` values, used because those packages are transitive (a second copy would break `instanceof`).

## Relationships

- **`src/app.ts`** — Calls `installErrorHandling(app)` after all routes are mounted, making this the last middleware in the chain.
- **`src/infrastructure/adapters/logger.ts`** — Source of `logger` and `auditLogger`. This module relies on the logger's `redactFormat` to serialise `Error` objects (name, message, stack) before JSON output, so it passes errors whole rather than hand-picking fields.
- **`src/infrastructure/http/errors.ts`** — Provides `databaseErrorInterpreter` (maps DB driver errors to a `[status, code, message]` tuple) and `rejectServiceUnavailable` (503 response helper).
- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse`, the standard 4xx/5xx response sender used for all non-503, non-Multer responses.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Source of `t()`, used to resolve the i18n message keys in `CLIENT_ERROR_COPY` and the 500 fallback.
- **`src/infrastructure/observability/tracer.ts`** — Provides `recordErrorOnActiveSpan` and `getActiveSpanContext` for attaching the error to the current span and extracting the `traceId` for log correlation.
- **`src/infrastructure/observability/metrics-process.ts`** — Source of `processUnhandledRejectionsTotal`, the Prometheus counter incremented per unhandled rejection.
- **`src/infrastructure/runtime/config.ts`** — Provides `isTestEnvironment()`; when true, process-level handlers are **not** registered so the test runner can own them.
- **`tests/unit/app/error-handling.test.ts`** — Unit tests for `handleUncaughtError` and helpers.
- **`tests/unit/app/process-error-handlers.test.ts`** — Unit tests for `handleUnhandledRejection` and the `uncaughtException` handler.
- **`tests/integration/auth-hardening.test.ts`** / **`tests/integration/scenarios/demo-routes.test.ts`** — Integration tests that exercise error paths flowing through this handler.

## Notes

- **Mounting order is load-bearing.** `installErrorHandling` must be called *after* `installRoutes`; an Express error handler only catches errors from middleware/routes registered before it. A test that adds a throwing route *after* installation will not reach `handleUncaughtError`.
- **Client responses never include `error.message`.** The only exception is `MulterError`, whose messages are explicitly user-facing. All other paths use constants from `CLIENT_ERROR_COPY` or the 500 fallback, translated via `t()`.
- **Logging severity follows the resolved status, not the exception class.** 4xx → `logger.warn`, 5xx → `logger.error`. This prevents routine client mistakes from triggering alerting.
- **`uncaughtException` always exits the process** (`process.exit(1)`), while `unhandledRejection` does not. The distinction is intentional: an uncaught exception implies unknown process state, a lost promise does not.
- **In test environments, no process-level handlers are registered.** This lets Jest (or the runner) pin unhandled rejections to the responsible test instead of them being swallowed into an audit log line.
- **Database errors are matched by `name` regex, not `instanceof`.** Mongo/BSON are transitive dependencies; a second copy in `node_modules` would make `instanceof` return `false` silently.
