---
source: src/infrastructure/observability/tracer.ts
sha256: 1d6a01d370c21c19d8e099f225d0382208dd269487e300d591b9409f373e2be6
generated_at: 2026-09-23T17:49:32.159560+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/tracer.ts

## Purpose

Thin wrapper around the OpenTelemetry API that centralises span creation, error recording, and trace-context retrieval for this service. It lets any part of the codebase open spans, stamp errors, or pull the active trace ID without importing the SDK directly or worrying about no-op behaviour when the provider is not yet registered.

## Key elements

- **`getTracer()`** — Returns the active OTel tracer (name `boilerplate-node-backend`). Called lazily so that import order relative to `startTracing()` does not lock in a no-op tracer.
- **`withSpan<T>(spanName, callback, attributes?)`** — Runs an async callback inside a new active child span. Sets `OK` status and ends the span on success; sets `ERROR` status, records the exception, and re-throws on failure. Uses `startActiveSpan` so downstream calls (Mongoose, HTTP) auto-attach as children.
- **`getActiveSpanContext()`** — Reads the current span from OTel's AsyncLocalStorage and returns `{ traceId, spanId }` (or `undefined` fields) for cross-signal correlation in logs, audit, and analytics.
- **`recordErrorOnActiveSpan(error)`** — Annotates the currently active span with an error status and exception event without ending it. Intended for error-handling paths that manage the span lifecycle elsewhere.
- **`isValidOtelId`** (internal) — Filters out all-zeros trace/span IDs that OTel emits for no-op contexts, preventing meaningless IDs in log lines.

## Relationships

- **`src/infrastructure/http/middlewares/request-logger.ts`** — Calls `getActiveSpanContext()` to stamp `traceId`/`spanId` onto structured log entries.
- **`src/infrastructure/observability/audit.ts`** — Stamps the same `traceId` from `getActiveSpanContext()` onto audit events for cross-signal correlation.
- **`src/infrastructure/observability/analytics/index.ts`** — Similarly enriches analytics payloads with the active trace context.
- **`src/app/error-handling.ts`** — Invokes `recordErrorOnActiveSpan()` to annotate the request span with unhandled errors before propagating them to the client.
- **`src/infrastructure/adapters/mailer.ts`** — Wraps outbound mail operations in `withSpan()` so delivery latency and failures appear as child spans.
- **`tests/unit/infrastructure/observability/tracer.test.ts`** — Unit-tests the public exports; relies on the no-op `@opentelemetry/api` behaviour to run without booting an SDK.

## Notes

- The module imports only `@opentelemetry/api` (the interface package), never the SDK. Without a registered provider every call is a silent no-op, which is what lets tests and pre-`startTracing()` code paths work unchanged.
- `withSpan` uses a two-callback `.then(onFulfilled, onRejected)` form specifically so the success handler cannot throw and end the span a second time.
- `recordErrorOnActiveSpan` deliberately does **not** call `span.end()`; the span belongs to whoever opened it (typically the auto-instrumented request span), and ending it here would truncate remaining child work.
- The tracer name is hard-coded as `boilerplate-node-backend` — it identifies the instrumentation source on every span, distinguishing hand-written spans from auto-generated ones.
