---
source: src/infrastructure/observability/tracer.ts
sha256: 219387c7576686ce0a88914ca4bb9692fdae7f7b5b61fad6e001cc65de3c6076
generated_at: 2026-10-29T02:11:43.125790+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/tracer.ts

## Purpose

Thin wrapper around the OpenTelemetry API that centralises tracer access, span lifecycle management, and trace-context retrieval for this service. It exists so that call sites import a small, typed surface (`getTracer`, `withSpan`, `getActiveSpanContext`, `recordErrorOnActiveSpan`) rather than touching the raw `@opentelemetry/api` directly, and so that cross-signal correlation (audit, analytics, logging) shares one consistent way to read the active span context.

## Key elements

- **`getTracer()`** – Returns the service-scoped tracer (`'boilerplate-node-backend'`). Called lazily so import-time never captures the no-op tracer before `startTracing()` registers the real provider.
- **`withSpan<T>(spanName, callback)`** – Runs an async callback inside a *named active* span. Sets `OK`/`ERROR` status, records a sanitised exception event on failure, ends the span, and re-throws. Uses `startActiveSpan` so downstream auto-instrumented calls (e.g. Mongoose) attach as children automatically.
- **`getActiveSpanContext()`** – Reads the current span from OTel's `AsyncLocalStorage` and returns `{ traceId, spanId }` (or `undefined` fields when no span is active). Filters out all-zeros no-op IDs.
- **`recordErrorOnActiveSpan(error)`** – Annotates the currently active span with an error status and (if `Error`) a sanitised exception event. Deliberately does **not** call `span.end()`.
- **`recordSanitisedException(span, error)`** (internal) – Calls `span.recordException` with the full `Error` in relaxed environments, but only `{ name }` in production to avoid shipping stack traces with absolute paths.
- **`isValidOtelId(id)`** (internal) – Rejects empty strings and all-zeros IDs (the OTel no-op sentinel).

## Relationships

- **`src/infrastructure/runtime/config.ts`** – Imports `isRelaxedEnvironment` to decide whether full exception objects (with stack traces) are recorded on spans or stripped to just the error name.
- **`src/infrastructure/observability/audit.ts`** – Calls `getActiveSpanContext()` to stamp `traceId` on audit-log entries, enabling correlation between audit events and their parent trace.
- **`src/infrastructure/observability/analytics/index.ts`** – Calls `getActiveSpanContext()` to stamp `traceId` on analytics events for the same cross-signal correlation.
- **`src/infrastructure/http/middlewares/request-logger.ts`** – Uses `getActiveSpanContext()` to include trace/span IDs in structured request log lines.
- **`src/infrastructure/adapters/logger.ts`** – Consumes trace/span IDs (via the context helper) to attach correlation IDs to application log output.
- **`src/app/error-handling.ts`** – Calls `recordErrorOnActiveSpan` in global error handlers to annotate the request span without ending it.
- **`tests/unit/infrastructure/observability/tracer.test.ts`** – Unit-tests the exports; relies on the no-op behaviour of `@opentelemetry/api` when no SDK is registered.

## Notes

- `withSpan` uses the two-callback `.then(onFulfilled, onRejected)` form (not `.then().catch()`) so a throw inside the success handler cannot end the span twice.
- `span.end()` is mandatory for export; the code explicitly notes that an un-ended span is silently dropped by most backends.
- `recordErrorOnActiveSpan` intentionally leaves the span open — the span belongs to whoever opened it (typically the auto-instrumented request span), and ending it here would truncate the trace.
- In non-relaxed environments the span **status** still carries the error message; only the structured **exception event** is reduced to the error name. The message is not lost.
- `getTracer()` is exported as a function (not a constant) specifically to defer the `trace.getTracer` call past module-load time.
