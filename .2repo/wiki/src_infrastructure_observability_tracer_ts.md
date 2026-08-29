# src/infrastructure/observability/tracer.ts

## Purpose

Thin wrapper around the OpenTelemetry API that centralises span creation, span-context reading, and error annotation for the `boilerplate-node-backend` service. It lets any part of the codebase instrument an operation or correlate a log/audit/analytics event to a trace without importing OTel directly or worrying about the no-op fallback when no SDK is registered.

## Key elements

- **`getTracer()`** — Returns the active OTel tracer scoped to the name `boilerplate-node-backend`. Called lazily on each use (not cached at module level) so it always reflects the currently registered provider.
- **`withSpan<T>(spanName, callback, attributes?)`** — Runs an async callback inside a new child span. Sets OK/ERROR status, records the exception on failure, always ends the span, and re-throws the error. Uses `startActiveSpan` so the span is *current* for the duration of the callback (children attach automatically via async context).
- **`getActiveSpanContext()`** — Reads the trace ID and span ID from the currently active span via `trace.getActiveSpan()`. Returns `undefined` fields when no span is active or when IDs are the all-zeros sentinel (no-op context). Used to stamp `traceId`/`spanId` onto log lines, audit events, and analytics events for cross-signal correlation.
- **`recordErrorOnActiveSpan(error)`** — Annotates the currently active span with an ERROR status and a structured exception event. Does **not** call `span.end()`; the span's lifecycle belongs to whoever opened it.
- **`isValidOtelId`** (internal) — Rejects all-zeros trace/span IDs that OTel emits in no-op contexts, preventing misleading `trace_id: 000…0` values in logs.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — Calls `getActiveSpanContext()` to stamp the current `traceId` onto audit events, enabling a log line to be pivoted straight to its trace.
- **`src/infrastructure/observability/analytics/index.ts`** — Same pattern: reads `getActiveSpanContext()` to attach `traceId` to analytics events.
- **`src/infrastructure/http/middlewares/request-logger.ts`** — Calls `getActiveSpanContext()` so each HTTP log line carries the active `traceId`/`spanId`.
- **`src/app/error-handling.ts`** — Calls `recordErrorOnActiveSpan()` in error-handling paths to annotate the request span with the error without altering the span's lifetime.
- **`src/infrastructure/adapters/mailer.ts`** — Uses `withSpan()` to wrap outbound mail operations in a named child span.
- **`tests/unit/infrastructure/observability/tracer.test.ts`** — Unit tests for the helpers above; relies on the `@opentelemetry/api` no-op behaviour so no SDK needs to be booted.

## Notes

- **No-op safety by design.** `@opentelemetry/api` is the *interface* package only. Importing it with no SDK registered makes every call a silent no-op, which is what allows tests and pre-startup code to use these helpers freely.
- **`getTracer()` is intentionally not a module-level constant.** Caching the result at import time would freeze a no-op tracer if `startTracing()` hasn't run yet.
- **`withSpan` uses the two-callback `.then(onFulfilled, onRejected)` form** (not `.then().catch()`) so the success and failure paths are mutually exclusive and the span can't be ended twice.
- **`recordErrorOnActiveSpan` never ends the span.** The active span is typically the auto-instrumented HTTP request span; ending it from a downstream error handler would truncate the trace.
- **Tracer name convention.** The constant `boilerplate-node-backend` is the instrumentation-source identifier that appears on every hand-written span, distinguishing it from spans produced by auto-instrumentations (Express, Mongoose, Redis, etc.).
