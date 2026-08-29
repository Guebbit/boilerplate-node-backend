# tests/unit/infrastructure/observability/tracer.test.ts

## Purpose

Unit tests for the OpenTelemetry tracing utilities in `src/infrastructure/observability/tracer.ts`. Verifies that the four exported helpers (`getTracer`, `withSpan`, `getActiveSpanContext`, `recordErrorOnActiveSpan`) behave correctly on both success and failure paths without requiring a live collector.

## Key elements

- **`setupTestProvider`** – Creates an `InMemorySpanExporter` + `NodeTracerProvider` (with `SimpleSpanProcessor`) and registers it as the global provider; returns the exporter for assertions.
- **`teardownTestProvider`** – Shuts down the provider and calls `trace.disable()` to restore a clean state.
- **`describe('getTracer')`** – Confirms the factory returns a non-throwing tracer that can start a span.
- **`describe('withSpan — success')`** – Asserts the callback's return value is passed through, the span is exported with the correct name, and a third-argument `attributes` object is applied.
- **`describe('withSpan — error')`** – Asserts the promise re-throws the error, the span is still ended and exported, and an `exception` event carrying `exception.message` is recorded.
- **`describe('getActiveSpanContext')`** – Verifies `traceId`/`spanId` are `undefined` outside a span and match expected hex-ID formats inside one.
- **`describe('recordErrorOnActiveSpan')`** – Verifies no-throw when no span is active, correct `exception` event recording, and graceful handling of non-`Error` values (e.g. plain strings).
- **`describe('context baseline')`** – Sanity check that `trace.getActiveSpan()` is `undefined` under `ROOT_CONTEXT`.

## Relationships

- **`src/infrastructure/observability/tracer.ts`** – The system under test. This file imports `getTracer`, `withSpan`, `getActiveSpanContext`, and `recordErrorOnActiveSpan` from it (via the `@infrastructure/observability/tracer` path alias) and exercises each function's observable contract.

## Notes

- Every `describe` block creates and tears down its **own** `NodeTracerProvider` in `beforeEach`/`afterEach` for full isolation; there is no shared global provider across blocks.
- Assertions on span contents (name, attributes, events) are made against the `InMemorySpanExporter.getFinishedSpans()` array after the span has been explicitly ended.
- The error-path tests for `withSpan` intentionally call `.catch(() => {})` to suppress the expected rejection before inspecting exported spans.
- `recordErrorOnActiveSpan` is tested with a plain string to confirm the implementation does not assume the `Error` interface.
