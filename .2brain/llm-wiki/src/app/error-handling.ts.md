---
source: src/app/error-handling.ts
sha256: df028c79a4802f3f5be64cedc4825a4c9c995125405058685856a2f96beec1dc
generated_at: 2026-09-27T14:02:25.246512+00:00
model: ollama:qwen3.8:27b
---

# src/app/error-handling.ts

## Purpose

Centralises the "what happens to a failure nobody else handled" logic at both the request level (a single Express error handler mounted last) and the process level (`unhandledRejection` / `uncaughtException` listeners). Keeps status resolution, logging, and client-facing copy in one place so routes and controllers never repeat the dispatch logic.

## Key elements

- **`clientErrorStatus(error)`** — Reads the `http-errors` contract (`expose: true` + a 4xx `status`/`statusCode`) without enumerating individual `.type` strings. Returns the declared status or `undefined`.
- **`CLIENT_ERROR_COPY`** — Constant map (`400`, `413`, `415`) of `{ code, messageKey }` for client-facing responses. The only copy the client ever sees for those statuses.
- **`resolveStatus(error)`** — Single decision point for the HTTP status: `MulterError` → 400; declared client error → its own status; otherwise delegates to `databaseErrorInterpreter`.
- **`handleUncaughtError(error, req, res, next)`** — The Express error handler. Guards on `headersSent`, records the error on the active OTel span, logs once with request/trace ids, then dispatches to the correct response branch (503, 500, client-error, or generic fallback).
- **`installErrorHandling(app)`** — Mounts `handleUncaughtError` on the app and (unless `NODE_ENV === 'test'`) registers the two process-level listeners. Must be called after route installation.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` and `auditLogger`; relies on `redactFormat` to serialise raw `Error` objects into safe `{name, message, stack}` JSON.
- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse` to emit structured error bodies.
- **`src/infrastructure/http/errors.ts`** — Imports `databaseErrorInterpreter` (status resolution for driver errors) and `rejectServiceUnavailable` (503 branch).
- **`src/infrastructure/observability/tracer.ts`** — Imports `getActiveSpanContext` (trace id for log lines) and `recordErrorOnActiveSpan` (OTel span annotation).
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Imports `t()` to resolve localised message keys used in every client-facing copy.
- **`src/app.ts`** — Calls `installErrorHandling(app)` after `installRoutes`, which is the required ordering for Express to forward errors into the handler.
- **`tests/unit/app/error-handling.test.ts`** — Unit-tests the handler in isolation.
- **`tests/unit/app/process-error-handlers.test.ts`** — Unit-tests the process-level listeners.
- **`tests/integration/app/demo-routes.test.ts`**, **`tests/integration/auth-hardening.test.ts`** — Exercise error paths end-to-end.

## Notes

- **Ordering is load-bearing.** `installErrorHandling` must run after all routes/middleware; an Express error handler only catches errors from handlers mounted *before* it.
- **`error.message` is never forwarded** to the client (except `MulterError`, whose messages are user-facing by design). All other branches use constant copy from `CLIENT_ERROR_COPY` or i18n keys. This is a deliberate information-disclosure rule.
- **Process handlers are skipped under `NODE_ENV === 'test'`** so Jest can attribute rejections to the failing test rather than them being swallowed into an audit log line.
- **`uncaughtException` always calls `process.exit(1)`.** The post-exception state is considered unrecoverable; throwing would re-enter the handler.
- The `headersSent` guard delegates to `next(error)` so Express's built-in handler closes the half-sent stream, rather than leaving it open.
