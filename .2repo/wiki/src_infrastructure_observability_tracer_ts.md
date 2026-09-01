# src/infrastructure/observability/tracer.ts

## Purpose

Thin wrapper around the OpenTelemetry `@opentelemetry/api` interface package, providing a small set of helpers for creating custom spans and reading the active trace context. Exists so that application code never imports the OTel API directly and so that all hand-written spans share a single, consistent tracer name.

## Key elements

- **`getTracer()`** — Returns the active OTel tracer (name: `boilerplate-node-backend`). Called lazily each time so a no-op tracer grabbed at import time (before the SDK registers) is never cached.
- **`withSpan(spanName, callback, attributes?)`** — Runs an async callback inside a new *active* child span. Sets status OK/ERROR, records exceptions, calls `span.end()`, and re-throws. Uses `startActiveSpan` (not `startSpan`) so nested work inherits the span automatically.
- **`getActiveSpanContext()`** — Reads the current `traceId` / `spanId` from OTel's async context. Filters out all-zero (no-op) IDs, returning `undefined` for absent fields.
- **`recordErrorOnActiveSpan(error)`** — Annotates the currently active span with ERROR status and an exception event. Deliberately does **not** call `span.end()`; the span is owned by whoever opened it.
- **`isValidOtelId`** (internal) — Rejects empty or all-zero hex strings so no-op spans don't produce fake IDs.

## Relationships

- **`src/infrastructure/observability/audit.ts`** & **`src/infrastructure/observability/analytics/index.ts`** — Call `getActiveSpanContext()` to stamp the same `traceId` onto audit/analytics events, enabling cross-signal correlation with the request span.
- **`src/app/error-handling.ts`** — Calls `recordErrorOnActiveSpan()` inside its error handlers to annotate the request span without intercepting the error flow.
- **`src/infrastructure/http/middlewares/request-logger.ts`** — Calls `getActiveSpanContext()` to attach `traceId`/`spanId` to structured log lines.
- **`tests/unit/infrastructure/observability/tracer.test.ts`** — Unit tests for the exported helpers; relies on the no-op behavior of `@opentelemetry/api` when no SDK is registered.

## Notes

- Importing `@opentelemetry/api` is safe without a registered SDK: every call becomes a no-op. This is what lets unit tests run without booting OpenTelemetry.
- `withSpan` intentionally re-throws; it observes but never swallows. Callers keep their own `try/catch` intact.
- `recordErrorOnActiveSpan` skips `span.end()` on purpose. Calling it would truncate the auto-instrumented request span that owns the context.
- The tracer name is a fixed constant (`boilerplate-node-backend`), not configurable at runtime. Change it only if you split the service into multiple instrumentation sources.
- `getTracer()` is called on every `withSpan` invocation rather than stored in a module-level constant—this avoids capturing a no-op tracer at import time before `startTracing()` registers the real provider.
