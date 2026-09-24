---
source: src/app/error-handling.ts
sha256: 1885196c81483f5140712751124130f36c9beb51a3808a4769ae18d3f34830dd
generated_at: 2026-09-23T17:35:25.821431+00:00
model: ollama:qwen3.8:27b
---

# src/app/error-handling.ts

## Purpose

The single global error boundary for the Express app plus the two process-level safety nets (`unhandledRejection`, `uncaughtException`) that catch failures no route or middleware handled. It exists so that every failure path—whether inside a request or outside one—resolves to a logged, client-safe response instead of a silent crash or an information leak.

## Key elements

- **`clientErrorStatus(error)`** (internal) — Reads the `http-errors` contract (`expose === true` + a 4xx `status`/`statusCode`) off an arbitrary `Error` without casting. Returns the declared status or `undefined`.
- **`CLIENT_ERROR_COPY`** (internal constant) — Maps a small set of 4xx statuses to fixed `{ code, messageKey }` pairs. The only place that decides what a client actually sees for non-500 errors.
- **`resolveStatus(error)`** (internal) — Priority chain: `MulterError` → 400; declared client error → its own status; `databaseErrorInterpreter` fallback. Guarantees the log line and the response agree on the status.
- **`handleUncaughtError`** (exported) — The Express error handler. Records the error on the active OTel span, logs it (with request/trace IDs), then sends one of three response shapes: forwarded Multer message, a constant 500, or a constant 4xx from `CLIENT_ERROR_COPY`.
- **`installErrorHandling(app)`** (exported) — Mounts `handleUncaughtError` last on the Express app and (in non-test environments) registers the `unhandledRejection` and `uncaughtException` process handlers. Must be called after routes are installed.

## Relationships

- **`src/app.ts`** — Calls `installErrorHandling(app)` after all routes are mounted; this ordering is required for Express to route errors into the handler.
- **`src/infrastructure/adapters/logger.ts`** — Source of `logger` (request-level error log) and `auditLogger` (process-level audit log). Both use a `redactFormat` serializer that expands a whole `Error` into `{name, message, stack}`.
- **`src/infrastructure/http/errors.ts`** — Provides `databaseErrorInterpreter`, the fallback that maps driver errors (duplicate key, malformed ObjectId, etc.) to a 4xx status.
- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse`, the single helper used to send the JSON error envelope.
- **`src/infrastructure/observability/tracer.ts`** — Provides `recordErrorOnActiveSpan` and `getActiveSpanContext` so every handled error is stamped onto the current span and the log carries the trace ID.
- **`src/infrastructure/i18n/index.ts`** — Provides `t()` to resolve the `messageKey` values in `CLIENT_ERROR_COPY` and the 500 copy into the client's locale.
- **`tests/unit/app/error-handling.test.ts`** — Unit-tests `handleUncaughtError` by driving it directly (the handler is exported for this purpose).
- **`tests/unit/app/process-error-handlers.test.ts`** — Exercises the `unhandledRejection` / `uncaughtException` branches in isolation.
- **`tests/integration/app/demo-routes.test.ts`**, **`tests/integration/auth-hardening.test.ts`** — Integration tests that exercise the handler through real request cycles.

## Notes

- **Ordering is load-bearing.** `installErrorHandling` must run *after* `installRoutes`; an Express error handler only sees errors from middleware registered before it.
- **Never forwards `error.message` to the client** (except `MulterError`, whose messages are user-facing by design). All other responses use fixed strings from `CLIENT_ERROR_COPY` or the 500 constant. The detail lives only in the log.
- **`expose` is checked in addition to the 4xx range.** A library can set `status: 418` while still considering the error internal; `expose: true` is the thrower's explicit statement that the error describes the *request*.
- **Process-level handlers are skipped in `NODE_ENV === 'test'`.** Registering an `unhandledRejection` handler would swallow the rejection into an audit log line instead of letting Jest pin it to the failing test.
- **`uncaughtException` always calls `process.exit(1)`.** The process state after an uncaught exception is undefined; the handler logs and stops. It never re-throws.
- **Stryker mutation testing is disabled** around the `logger.error` call in `handleUncaughtError` (mutating that call would produce unobservable differences).
- **`databaseErrorInterpreter` is a safety net, not a substitute** for per-controller `.catch()` blocks. It exists to catch a forgotten `.catch()`, not to replace explicit handling.
