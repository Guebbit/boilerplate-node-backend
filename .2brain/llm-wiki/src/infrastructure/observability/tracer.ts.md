---
source: src/infrastructure/observability/tracer.ts
sha256: b1342d326716927b64483f992871c3756ebb9bcd8e5e5331c9746dea5bfadb27
generated_at: 2026-09-27T14:13:28.277046+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/tracer.ts

## Purpose

Thin wrapper around the OpenTelemetry API package (`@opentelemetry/api`) that centralises span creation, context retrieval, and error annotation for this service. It exists so that any module needing a custom span or trace correlation can import a single, consistently-named tracer without managing SDK lifecycle or context propagation themselves.

## Key elements

- **`getTracer()`** – Returns the active `Tracer` scoped to `'boilerplate-node-backend'`. Called lazily (not at module top-level) so it always picks up the real provider registered by `startTracing()`, never the import-time no-op.
- **`withSpan(spanName, callback, attributes?)`** – Runs an async callback inside a named child span. Sets `OK`/`ERROR` status, records the exception, ends the span, and re-throws on failure. Uses `startActiveSpan` so downstream calls (Mongoose, HTTP) attach as children automatically.
- **`getActiveSpanContext()`** – Reads the currently active span from OTel's async context and returns `{ traceId, spanId }`. Returns `undefined` fields when no span is active or the IDs are all-zeros (no-op context).
- **`recordErrorOnActiveSpan(error)`** – Annotates the active span with an error status and structured exception event. Does **not** end the span and does **not** throw; intended for error-handling paths that manage the error separately.
- **`isValidOtelId`** (module-private) – Guards against OTel's all-zeros placeholder IDs so untraced contexts don't leak meaningless identifiers into logs or events.

## Relationships

- **`src/app/error-handling.ts`** – Calls `recordErrorOnActiveSpan` to annotate the request span with the error before responding, without interfering with span lifecycle.
- **`src/infrastructure/http/middlewares/request-logger.ts`** – Calls `getActiveSpanContext()` to attach `traceId`/`spanId` to structured log lines for correlation.
- **`src/infrastructure/observability/audit.ts`** – Stamps the same `traceId` from `getActiveSpanContext()` onto audit events for cross-signal correlation.
- **`src/infrastructure/observability/analytics/index.ts`** – Uses `getActiveSpanContext()` to include the trace ID in analytics payloads.
- **`src/infrastructure/adapters/mailer.ts`** – Wraps mail-sending operations in `withSpan` so the send is visible as a child span under the request.
- **`tests/unit/infrastructure/observability/tracer.test.ts`** – Unit-tests the exported helpers; relies on the no-op behaviour of `@opentelemetry/api` when no SDK is registered.

## Notes

- The file imports only `@opentelemetry/api` (the interface package). If no SDK/provider is registered, every call is a silent no-op — this is by design and allows unit tests to run without booting OpenTelemetry.
- `withSpan` deliberately uses the two-callback form of `.then(onFulfilled, onRejected)` rather than `.then().catch()` to guarantee the span is ended exactly once on either path.
- `recordErrorOnActiveSpan` intentionally does **not** call `span.end()`. The span is owned by whoever opened it (typically auto-instrumentation); ending it here would truncate the parent span's duration.
- The tracer name `'boilerplate-node-backend'` appears on every hand-written span and distinguishes them from spans produced by auto-instrumentations (e.g., Mongoose, `http`).
