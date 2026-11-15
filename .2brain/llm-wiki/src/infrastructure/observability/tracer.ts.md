---
source: src/infrastructure/observability/tracer.ts
sha256: 4d044713319d3ee3760ab2e0e055b11c2442f37dd23cd9125a38238e37fe1aa4
generated_at: 2026-11-14T18:12:31.232563+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/tracer.ts

## Purpose

Thin wrapper around the OpenTelemetry API that provides a single service-scoped tracer and ergonomic helpers for creating, annotating, and finalising custom spans. It exists so that callers never need to touch `@opentelemetry/api` directly, and so that span lifecycle (open → annotate → end) is handled uniformly, including the privacy-sensitive error-annotation logic.

## Key elements

- **`TRACER_NAME`** — Constant `'boilerplate-node-backend'`; identifies the instrumentation source on every span for easy filtering.
- **`getTracer()`** — Lazily returns `trace.getTracer(TRACER_NAME)`. Called at use-time (not import-time) so that a no-op provider is never captured before `startTracing()` runs.
- **`withSpan<T>(spanName, callback)`** — Runs an async callback inside a child span via `startActiveSpan`. Wraps the call in `Promise.resolve().then()` so synchronous throws still hit the failure branch. Sets `SpanStatusCode.OK` or `ERROR`, calls `span.end()`, and re-throws on failure.
- **`markSpanFailed(span, error)`** — (internal) Sets `error.type`, status message, and an exception event. In non-relaxed environments the message is limited to `error.name` and the exception event is reduced to `{ name }` to avoid leaking request data or stack traces into the trace backend.
- **`recordErrorOnActiveSpan(error)`** — Annotates the *currently active* span with failure info without ending it. Intended for error handlers that manage the span's lifecycle themselves.

## Relationships

- **`src/infrastructure/runtime/config.ts`** — Imports `isRelaxedEnvironment()` to decide how much error detail to write onto spans.
- **`src/app/error-handling.ts`** — Consumer of `recordErrorOnActiveSpan`; calls it to annotate the request span inside global error handlers without truncating the span.
- **`src/infrastructure/http/errors.ts`** — Error instances thrown from HTTP layers are caught by `withSpan` / `recordErrorOnActiveSpan` and recorded via `markSpanFailed`.
- **`src/modules/observability/controllers/get-observability-metrics.ts`** — Reads span-derived metrics (error rates, durations) that this module produces.
- **`tests/unit/infrastructure/observability/tracer.test.ts`** — Unit tests for this file.

## Notes

- **No SDK required at import time.** `@opentelemetry/api` is the interface-only package; every call is a safe no-op when no SDK is registered, which is what lets tests run without booting OpenTelemetry.
- **`withSpan` never swallows errors.** It re-throws after annotating the span; callers keep their own error handling unchanged.
- **`recordErrorOnActiveSpan` deliberately does not call `span.end()`.** The span belongs to whoever opened it (typically an auto-instrumentation request span); ending it here would truncate it.
- **Two-callback `.then(onFulfilled, onRejected)` is used instead of `.then().catch()`** to keep success and failure paths mutually exclusive, preventing a double `span.end()`.
- **Span ending is mandatory for export.** A span that is never ended is never exported — the single most common way to silently lose telemetry.
- **Privacy split by environment.** In production/staging, only `error.name` is written as the status message and the exception event is reduced to `{ name }`. The companion scrubber (`span-scrub.ts`) applies the same rule to spans recorded by third-party libraries.
