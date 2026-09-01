# src/app/error-handling.ts

## Purpose

Global error handling for the Express application. It defines the last-resort error handler that catches any failure no route or middleware handled, and it registers `process.on` handlers for unhandled rejections and uncaught exceptions. Both answer the same question — "what happens to a failure nobody else handled?" — at the request level and the process level respectively.

## Key elements

- **`handleUncaughtError(error, request, response, _next)`** — The global Express error handler. Determines the status code (400 for `MulterError`, the stored `httpCode` for `ExtendedError`, the interpreted status for known driver errors, 500 otherwise), logs with request/trace IDs, records the error on the active OTel span, and sends a structured rejection via `rejectResponse`. For 500s the client receives a constant i18n message; the real detail lives only in the log.
- **`installErrorHandling(app)`** — Mounts `handleUncaughtError` on the Express app and registers `unhandledRejection` / `uncaughtException` process listeners. Skips the `uncaughtException` listener (and its `process.exit(1)`) when `NODE_ENV === 'test'` so Jest retains control of the process.

## Relationships

- **`src/app.ts`** — The caller. `installErrorHandling` must be invoked after routes are installed; the Express error handler only catches errors from middleware/routes mounted before it.
- **`src/infrastructure/adapters/logger.ts`** — Supplies `logger` (request-scoped error logging) and `auditLogger` (process-level events).
- **`src/infrastructure/http/errors.ts`** — Supplies the `ExtendedError` class (carries `httpCode` and `errors` array) and `databaseErrorInterpreter`, which maps known driver errors (malformed ObjectId, duplicate key, etc.) to a client-facing status < 500.
- **`src/infrastructure/http/response.ts`** — Supplies `rejectResponse`, the single formatting path for all error responses from this file.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Supplies `t()` for the two constant client-facing messages (`generic.error-unknown`, `generic.error-internal`).
- **`src/infrastructure/observability/tracer.ts`** — Supplies `recordErrorOnActiveSpan` (records the error on the current span) and `getActiveSpanContext` (extracts the trace ID for the log line).
- **`tests/unit/app/process-error-handlers.test.ts`** — Unit-tests the process-level handler registration (verifying the test-env skip logic and the audit log calls).
- **`package.json`** — Declares the runtime dependencies this file imports (`express`, `multer`).

## Notes

- **Mount order matters.** `handleUncaughtError` must be registered *after* all routes (and the 404 catch-all). Adding a throwing route after the handler is mounted makes it unreachable, which is why the comment notes it can't be reached by "just adding a route to `app`" in a test.
- **500 response is deliberately opaque.** The client always gets the i18n constant `INTERNAL_ERROR` / `error-internal`; `error.message` is never forwarded. All detail goes to the log line with `request_id` and `trace_id`.
- **`databaseErrorInterpreter` is a safety net, not a substitute.** It covers the case where a controller forgot a `.catch()`. The documented expectation (see `docs/theory/request-flow.md`) is that controllers handle their own driver errors.
- **`uncaughtException` handler always exits.** It logs then calls `process.exit(1)` in every non-test environment because the process state after an uncaught exception is undefined.
- **`NODE_ENV === 'test'` guard.** Only the `uncaughtException` listener is skipped; the `unhandledRejection` listener is still registered under the test runner.
