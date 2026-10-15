---
source: tests/unit/infrastructure/observability/tracer.test.ts
sha256: 3547c2dd42630e7387f65d209e564aa46e917fee05acee0b410004a5f46cdd81
generated_at: 2026-10-15T13:17:46.777243+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/tracer.test.ts

## Purpose

Unit tests for the OpenTelemetry tracing helpers exported from `@infrastructure/observability/tracer`. Validates span creation, error recording, active-context inspection, and environment-dependent behavior (stack-trace / message inclusion in dev vs. production) using an in-memory span exporter so no real backend is required.

## Key elements

- **`setupTestProvider` / `teardownTestProvider`** — Local helpers that create a `NodeTracerProvider` wired to an `InMemorySpanExporter` via `SimpleSpanProcessor`, then shut it down and disable the global tracer. Each `describe` block calls these in `beforeEach`/`afterEach` for isolation.
- **`throwing`** — A tiny utility that throws synchronously (before returning a promise), used to exercise the sync-throw path of `withSpan`.
- **`describe('getTracer')`** — Verifies the factory doesn't throw and that the returned tracer can start and end a span.
- **`describe('withSpan — success')`** — Confirms the callback's return value is propagated and the finished span is exported with the correct name.
- **`describe('withSpan — error')`** — Covers: rejection re-throw, span still ends on failure, sync-throw path, exception-event attributes (`exception.message`, `exception.stacktrace`), and production-mode suppression of stack traces and messages.
- **`describe('getActiveSpanContext')`** — Checks that `traceId`/`spanId` are `undefined` outside a span and match the expected hex formats inside one.
- **`describe('recordErrorOnActiveSpan')`** — Verifies no-op when no span is active, exception-event recording, production stack-trace suppression, and graceful handling of non-Error values.
- **`describe('context baseline')`** — Sanity-checks that `trace.getActiveSpan()` returns `undefined` under `ROOT_CONTEXT`.

## Relationships

- **`src/infrastructure/observability/tracer.ts`** — The module under test. Imports `getTracer`, `withSpan`, `getActiveSpanContext`, and `recordErrorOnActiveSpan`.
- **`tests/support/environment.ts`** — Supplies `setEnvironment`, used to swap `NODE_ENV` between `'development'` and `'production'` in order to assert different exception-attribute sets on recorded spans.

## Notes

- The tests deliberately register a **new** `NodeTracerProvider` per `describe` block and call `trace.disable()` on teardown; a stale global provider from a previous suite will silently break assertions.
- Production-mode tests assert the **exact** shape of `event.attributes` (`toEqual({ 'exception.type': 'TypeError' })`), so adding a new always-present attribute to the tracer implementation will break these tests.
- `setEnvironment` is called inline (not in `beforeEach`), meaning any test that forgets to reset the environment could leak state into the next test in the same file.
- The sync-throw test (`throwing`) exists because `withSpan` must handle callbacks that throw before returning a `Promise`; a standard `Promise.reject` callback doesn't exercise that path.
