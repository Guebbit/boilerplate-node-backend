---
source: src/infrastructure/observability/tracer.ts
sha256: 1738a3bda42e2fadecb3c4886c70fc40bcc7a5d91bbf1851b1f3b01cc5c94d82
generated_at: 2026-10-14T08:07:45.226675+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/tracer.ts

## Purpose

A thin wrapper around the `@opentelemetry/api` interface that provides a single tracer instance and a small set of ergonomic helpers (`withSpan`, `getActiveSpanContext`, `recordErrorOnActiveSpan`) so that hand-written spans, cross-signal correlation, and error annotation are consistent across the codebase without requiring callers to deal with OTel's context mechanics directly.

## Key elements

- **`TRACER_NAME`** (`'boilerplate-node-backend'`) — identifies this service as the instrumentation source on every hand-written span.
- **`getTracer()`** — lazily calls `trace.getTracer(TRACER_NAME)`; avoids grabbing a no-op tracer at import time before the SDK provider is registered.
- **`withSpan(spanName, callback, attributes?)`** — runs an async callback inside a new active span (`startActiveSpan`). Sets `OK`/`ERROR` status, records a sanitised exception on failure, always calls `span.end()`, and re-throws so callers keep their existing error handling.
- **`getActiveSpanContext()`** — reads the active span from OTel's `AsyncLocalStorage` and returns `{ traceId?, spanId? }`. Filters out all-zeros IDs (no-op spans) so callers can safely stamp them on audit/analytics/log records.
- **`recordErrorOnActiveSpan(error)`** — sets `ERROR` status and records a sanitised exception on the *currently active* span without calling `span.end()` (the span belongs to whoever opened it).
- **`recordSanitisedException(span, error)`** *(internal)* — calls `span.recordException`, but strips the stack trace outside relaxed environments to avoid leaking absolute paths to the trace backend.
- **`isValidOtelId(id)`** *(internal)* — rejects empty strings and all-zero IDs.

## Relationships

- **`src/infrastructure/runtime/config.ts`** — provides `isRelaxedEnvironment()`, which controls whether full exception stack traces are attached or only the error name.
- **`src/app/error-handling.ts`** — expected consumer of `recordErrorOnActiveSpan()` to annotate the request span from a central error handler without ending it.
- **`src/infrastructure/observability/audit.ts`** and **`src/infrastructure/observability/analytics/index.ts`** — consume `getActiveSpanContext()` to stamp the same `traceId` onto audit and analytics events, enabling cross-signal correlation.
- **`src/infrastructure/http/middlewares/request-logger.ts`** — consumes `getActiveSpanContext()` to include trace/span IDs in structured request logs.
- **`src/infrastructure/adapters/logger.ts`** — likely correlates log lines to the active span via `getActiveSpanContext()`.
- **`tests/unit/infrastructure/observability/tracer.test.ts`** — unit tests exercising the above exports.

## Notes

- All OTel calls are safe no-ops when no SDK is registered (e.g. in unit tests), so there is no conditional import or guard needed.
- `withSpan` intentionally uses `startActiveSpan` (not `startSpan`) so child operations inside the callback attach automatically via async context; no span is threaded through signatures.
- `recordErrorOnActiveSpan` deliberately does **not** call `span.end()` — the owning span (typically the auto-instrumented HTTP request span) must remain open for its full lifetime.
- Exception sanitisation (`recordSanitisedException`) is environment-gated: outside `dev`/`test` only `error.name` is recorded on the span event to prevent absolute paths and dependency internals from reaching the trace collector.
