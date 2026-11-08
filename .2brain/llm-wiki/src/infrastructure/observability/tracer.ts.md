---
source: src/infrastructure/observability/tracer.ts
sha256: 219387c7576686ce0a88914ca4bb9692fdae7f7b5b61fad6e001cc65de3c6076
generated_at: 2026-11-08T03:41:32.814950+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/tracer.ts

## Purpose

Thin wrapper around the `@opentelemetry/api` interface package that centralises span creation, error annotation, and trace-context extraction for this service. It lets any module create or annotate spans without importing the OTel SDK directly, and degrades to no-ops when no SDK is registered (e.g. in tests).

## Key elements

- **`getTracer()`** – Returns the active OTel tracer scoped to `TRACER_NAME` (`'boilerplate-node-backend'`). Called lazily so the global provider can register after import.
- **`withSpan<T>(spanName, callback)`** – Executes an async callback inside a new active child span. Sets `OK`/`ERROR` status, records a sanitised exception event on failure, ends the span, and re-throws. Success and failure paths use a two-callback `.then()` to prevent double-ending.
- **`getActiveSpanContext()`** – Reads the currently active span via `trace.getActiveSpan()` and returns `{ traceId, spanId }`, with `undefined` for missing or all-zeros (invalid) IDs.
- **`recordErrorOnActiveSpan(error)`** – Annotates the active span with an ERROR status and exception event *without* ending it (the span belongs to whoever opened it, typically an auto-instrumented request span).
- **`isValidOtelId(id)`** – Internal guard that rejects empty or all-zeros IDs so no-op spans don't pollute logs.
- **`recordSanitisedException(span, error)`** – Internal helper: records the full error (including `stacktrace`) only when `isRelaxedEnvironment()` is true; otherwise records only `error.name`.

## Relationships

- **`src/infrastructure/runtime/config.ts`** – Imports `isRelaxedEnvironment` to decide whether `recordSanitisedException` includes the stack trace.
- **`src/app/error-handling.ts`** – Consumes `recordErrorOnActiveSpan` so error handlers can annotate the request span without altering its lifecycle.
- **`src/infrastructure/observability/audit.ts`** / **`src/infrastructure/observability/analytics/index.ts`** – Call `getActiveSpanContext` to stamp the same `traceId` on audit and analytics events, enabling cross-signal correlation.
- **`src/infrastructure/http/middlewares/request-logger.ts`** – Uses `getActiveSpanContext` to attach trace/span IDs to structured log lines.
- **`src/infrastructure/adapters/logger.ts`** – Correlates log entries with the active span via the same context helpers.
- **`tests/unit/infrastructure/observability/tracer.test.ts`** – Unit-tests the exports above in a no-SDK (no-op) environment.

## Notes

- `@opentelemetry/api` is the *interface* package only; it is safe to import without a registered SDK (every call is a no-op). The SDK/provider is started elsewhere via `startTracing()`.
- `withSpan` uses `startActiveSpan` (not `startSpan`) so child operations created inside the callback (Mongoose queries, nested spans) attach automatically via `AsyncLocalStorage`.
- `recordErrorOnActiveSpan` deliberately does **not** call `span.end()`; ending it here would truncate the parent auto-instrumented span.
- Outside relaxed environments (prod, staging) only `error.name` is written to the exception event; the human-readable message still appears in the span's `status.message`. This avoids shipping absolute file paths or internal dependency frames to the trace backend.
- The tracer name (`'boilerplate-node-backend'`) is the instrumentation source label that distinguishes hand-written spans from auto-instrumentation spans in the backend UI.
