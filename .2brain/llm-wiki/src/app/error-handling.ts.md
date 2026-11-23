---
source: src/app/error-handling.ts
source_sha256: dff2232981693d8f75d6deb2703fcf96033dd6799aba68227fb5484b680b9574
context_sha256: b63d7c49d11bf7ce59d6f79bdf010b40d5839cb3dc34579390a59529fa009c2c
generated_at: 2026-11-22T02:30:25.625562+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/error-handling.ts

## Purpose
Defines the global Express error handler and the process-level handlers for `unhandledRejection` and `uncaughtException`. Both cover the same question: what happens to a failure nobody else handled, inside a request and outside one.

## Key elements
- `handleUncaughtError(thrown, request, response, next)` (exported): the Express error middleware.
  - Wraps non-`Error` throws in an `Error`.
  - If `response.headersSent`, it delegates to `next(error)`.
  - It resolves a status, records the error on the active OTel span only for 5xx, and logs once. The log level is `error` for 5xx and `warn` for 4xx.
  - It then sends the response: a translated multer refusal, a 503 via `rejectServiceUnavailable`, a constant 500, or a constant-copy 4xx via `rejectResponse`.
- `handleUnhandledRejection(reason)` (exported): increments `processUnhandledRejectionsTotal` and audit-logs `process.unhandledRejection`. The process keeps running.
- `installErrorHandling(app)` (exported): mounts `handleUncaughtError` with `app.use`. Outside test environments it also registers the `unhandledRejection` and `uncaughtException` handlers. The `uncaughtException` handler audit-logs, then calls `process.exit(1)`.
- `clientErrorStatus` (internal): reads an `http-errors`-style contract. It requires `expose === true` and a numeric `status` or `statusCode` in the 400–499 range. It does not branch on `.type` strings.
- `resolveStatus` (internal): picks the status once so the log and response agree.
  - `MulterError` gives 413 for `LIMIT_FILE_SIZE` or `LIMIT_FIELD_VALUE`, and 400 for any other multer limit.
  - Otherwise a declared client error status is used.
  - Otherwise the status comes from `databaseErrorInterpreter`.
- `loggableError` (internal): for a declared client error carrying a string `type`, it logs only `{ type }`, because body-parser messages quote the client-controlled body. Any other error is passed through unchanged.
- `MULTER_SIZE_LIMIT_CODES` (internal): the set of byte-limit multer codes that map to 413.

## Relationships
- `src/app.ts`: the composition root, which is where installation is expected to happen. The file says `installErrorHandling` must run after `installRoutes`.
- `src/infrastructure/adapters/logger.ts`: provides `logger` (request errors) and `auditLogger` (process-level events). Its `redactFormat` serializes an `Error` into `{name, message, stack}`, which is why raw errors are passed whole.
- `src/infrastructure/adapters/log-scrub.ts`: `scrubError` decides whether the headline may include the error's message.
- `src/infrastructure/http/response.ts`: `rejectResponse` and `fieldError` build the error responses.
- `src/infrastructure/http/errors.ts`: `databaseErrorInterpreter` supplies the fallback status. `rejectServiceUnavailable` handles 503s.
- `src/infrastructure/persistence/mongo-errors.ts` and `src/infrastructure/observability/metrics-database.ts`: on a 503, `isQueryTimeout` triggers an increment of the `queryTimeoutsTotal` counter.
- `src/infrastructure/observability/tracer.ts`: `recordErrorOnActiveSpan` is called for 5xx.
- `src/infrastructure/observability/metrics-process.ts`: provides `processUnhandledRejectionsTotal`.
- `src/infrastructure/i18n/index.ts` and `src/infrastructure/i18n/context.ts`: the `t` translation function supplies the multer refusal text.
- `src/infrastructure/runtime/config.ts`: `isTestEnvironment()` skips the process-level handlers under a test runner.
- `src/modules/delivery/tests/unit/lost.test.ts` and `tests/integration/auth-hardening.test.ts`: listed as graph neighbors. The file's own comments only say the exported handler can be driven directly in tests.

## Notes
- The 5xx response body is a constant and never the error's message, to avoid leaking paths, hosts or keys. Client errors also use constant status-derived copy. `expose: true` is not treated as permission to forward library text.
- The handler is mounted after the 404 catch-all, so a test cannot reach it by adding a throwing route to `app`. That is why `handleUncaughtError` is exported.
- Under a test environment no process handlers are registered, so Jest can attribute unhandled rejections to the test that caused them.
- `uncaughtException` always exits with code 1 in every environment, after logging.
- The Stryker mutation-testing comments (`// Stryker disable all` / `// Stryker restore all`) wrap the logger call.
