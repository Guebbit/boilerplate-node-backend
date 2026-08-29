# src/app/error-handling.ts

## Purpose

Centralised error handling for the application at both levels a failure can surface: inside an HTTP request (as the final Express error middleware) and outside one (process-level `unhandledRejection` / `uncaughtException`). It ensures every unhandled error is logged, recorded on the active OpenTelemetry span, and responded to with a safe, generic payload.

## Key elements

- **`handleUncaughtError(error, request, response, _next)`** — The global Express error middleware. Dispatches by error type:
  - `MulterError` → 400 with the multer error code/message.
  - `ExtendedError` → its own `httpCode` and `errors` array.
  - Errors matching `databaseErrorInterpreter` with status < 500 → that status with a generic `INVALID_REQUEST` message.
  - Everything else → 500 with a constant `INTERNAL_ERROR` message (never `error.message`).
  - All branches log via `logger.error` with `request_id`, `trace_id`, and status; the error is also recorded on the active span.

- **`installErrorHandling(app: Express)`** — Mounts `handleUncaughtError` on the app and registers the two process-level handlers. In `NODE_ENV === 'test'` it skips the `uncaughtException` handler so Jest's own reporting is preserved.

## Relationships

- **`src/app.ts`** — Calls `installErrorHandling(app)` after route installation; this file's middleware is the last middleware in the Express chain.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger` (request-scoped error logging) and `auditLogger` (process-level audit events).
- **`src/infrastructure/http/errors.ts`** — Supplies the `ExtendedError` type (checked via `instanceof`) and `databaseErrorInterpreter` for classifying driver errors.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` is the single helper that writes the JSON error body; all branches in `handleUncaughtError` return through it.
- **`src/infrastructure/observability/tracer.ts`** — `recordErrorOnActiveSpan` attaches the error to the current span; `getActiveSpanContext().traceId` is included in log output.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t()` provides the localized strings for `generic.error-unknown` and `generic.error-internal`.
- **`tests/unit/app/process-error-handlers.test.ts`** — Unit-tests the process-level handler registration (rejection logging, exception logging, `process.exit` call, test-env skip).
- **`package.json`** — Runtime deps exercised here: `express`, `multer`.

## Notes

- **Mount order is critical.** `installErrorHandling` must run *after* `installRoutes`; an Express error middleware only catches errors thrown by middleware registered before it.
- **The 500 branch intentionally leaks nothing.** The response body is a constant translated string; `error.message` is log-only. Do not "helpfully" switch to returning the message.
- **`databaseErrorInterpreter` is a safety net, not a contract.** Controllers are still expected to `.catch()` their own database calls; this branch catches the ones that slip through.
- **In test mode the `uncaughtException` handler is deliberately not registered** so Node's default (and Jest's) reporting is preserved. The `unhandledRejection` handler is always registered.
- **`handleUncaughtError` is exported for direct testing** because, as a trailing error middleware, it cannot be reached by simply adding a throwing route after it.
