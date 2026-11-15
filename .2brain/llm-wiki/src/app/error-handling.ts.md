---
source: src/app/error-handling.ts
sha256: 70b3d436627e6a75d30c4cda5a821ab86229c3139eb362dd016824e96baf0461
generated_at: 2026-11-14T17:48:40.029586+00:00
model: ollama:qwen3.8:27b
---

# src/app/error-handling.ts

## Purpose

The single global error handler for the Express app plus the two process-level handlers (`unhandledRejection`, `uncaughtException`) that catch failures nobody else did. It centralises status resolution, log scrubbing, metric recording, and the client-facing response so that no route or middleware re-implements "what to do when something throws."

## Key elements

- **`handleUncaughtError(thrown, req, res, next)`** (exported) — Express 4-arg error handler. Wraps non-Error throws, delegates to `resolveStatus` for the status code, records 5xx on the active OTel span, logs at `error` (5xx) or `warn` (4xx), then sends a typed response: multer → translated field-level item, 503 → `rejectServiceUnavailable`, 500 → constant 500 body, other 4xx → `rejectResponse`.
- **`handleUnhandledRejection(reason)`** (exported) — Increments `processUnhandledRejectionsTotal`, audit-logs the raw reason, and lets the process keep running.
- **`installErrorHandling(app)`** (exported) — Mounts `handleUncaughtError` on the app and (outside test env) registers the `unhandledRejection` and `uncaughtException` listeners on the process. The `uncaughtException` listener audit-logs then calls `process.exit(1)`.
- **`resolveStatus(error)`** (internal) — Priority order: MulterError byte-limit → 413 / other → 400; `expose`+4xx contract; `databaseErrorInterpreter` fallback.
- **`clientErrorStatus(error)`** (internal) — Reads the `http-errors` contract (`expose === true` + 4xx `status`/`statusCode`) without branching on `.type` strings.
- **`loggableError(error, declaredClientError)`** (internal) — For declared client errors that carry a `type` field (body-parser), returns only `{ type }`; otherwise returns the error as-is for the logger's own `redactFormat` to serialise.

## Relationships

- **`src/app.ts`** — Calls `installErrorHandling(app)` after all routes are mounted; this file's handler must come last.
- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse` and `fieldError`, the two response-shaping utilities used for all outbound error bodies.
- **`src/infrastructure/http/errors.ts`** — Provides `databaseErrorInterpreter` (classifies driver errors into a status) and `rejectServiceUnavailable` (the 503 body).
- **`src/infrastructure/adapters/logger.ts`** — Source of `logger` and `auditLogger`; its `redactFormat` is what makes passing a raw `Error` object safe in log output.
- **`src/infrastructure/adapters/log-scrub.ts`** — `scrubError` is consulted to decide whether the headline log line should suppress the message.
- **`src/infrastructure/persistence/mongo-errors.ts`** — `isQueryTimeout` identifies query-timeout errors so the `queryTimeoutsTotal` counter can be incremented.
- **`src/infrastructure/observability/metrics-database.ts`** — `queryTimeoutsTotal` Prometheus counter.
- **`src/infrastructure/observability/metrics-process.ts`** — `processUnhandledRejectionsTotal` Prometheus counter.
- **`src/infrastructure/observability/tracer.ts`** — `recordErrorOnActiveSpan` attaches 5xx errors to the OpenTelemetry span.
- **`src/infrastructure/i18n/index.ts`** — `t()` translates the multer upload-refusal message.
- **`src/infrastructure/runtime/config.ts`** — `isTestEnvironment()` gates the process-level listener registrations so Jest's own rejection pinning is not swallowed.
- **`package.json`** — Runtime dependencies: `express`, `multer`.

## Notes

- **Mounting order is load-bearing.** `installErrorHandling` must be called *after* `installRoutes`; an Express error handler only catches errors from middleware/routes registered before it. A route added after the handler is unreachable by it.
- **Test environment skips process-level listeners.** Under Jest, neither `unhandledRejection` nor `uncaughtException` listeners are registered, so the test runner can pin the failure to the correct test.
- **500 body is a constant.** The client never sees `error.message`; only `rejectResponse(response, 500)`'s fixed code and copy are sent. The full detail lives in the log line.
- **4xx is logged at `warn`, 5xx at `error`.** A client mistake (409, 422, 413) is not an incident and must not page on-call.
- **OTel semconv:** 4xx responses intentionally do *not* call `recordErrorOnActiveSpan`; only 5xx mark the span as failed.
- **Stryker annotations** (`Stryker disable all` / `restore all`) surround the log call in `handleUncaughtError` to suppress mutation-testing noise around the ternary.
