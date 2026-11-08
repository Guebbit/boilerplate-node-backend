---
source: tests/unit/infrastructure/observability/tracer.test.ts
sha256: 7e0fc75813ecd610dbb77eb0fe2462f126d87f7546374c2f27751420e1a3983b
generated_at: 2026-11-08T10:21:28.572524+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/tracer.test.ts

## Purpose

Unit tests for the OpenTelemetry tracing utilities (`getTracer`, `withSpan`, `getActiveSpanContext`, `recordErrorOnActiveSpan`). Ensures spans are correctly started, ended, error-annotated, and that sensitive data (stack traces, messages) is suppressed in production while preserved in development.

## Key elements

- **`setupTestProvider()`** — Creates an isolated `InMemorySpanExporter` + `NodeTracerProvider` pair and registers it as the global tracer. Returns both for assertions and teardown.
- **`teardownTestProvider(provider)`** — Shuts down the provider and calls `trace.disable()` to clean global state.
- **`throwing`** — A helper callback that throws synchronously (not via `Promise.reject`), used to verify `withSpan` handles sync throws.
- **`describe('getTracer')`** — Verifies it returns a tracer that can start a span without throwing.
- **`describe('withSpan — success')`** — Confirms the callback's return value propagates and the named span is exported as finished.
- **`describe('withSpan — error')`** — Covers async rejection, sync throw, exception-event recording, and environment-dependent attribute filtering (stacktrace in dev, only `exception.type` in prod).
- **`describe('getActiveSpanContext')`** — Asserts `traceId`/`spanId` are undefined outside a span and match expected hex formats inside one.
- **`describe('recordErrorOnActiveSpan')`** — Verifies graceful no-op when no span is active, correct exception-event recording, production stacktrace suppression, and acceptance of non-Error values (strings).
- **`describe('context baseline')`** — Sanity-checks that `trace.getActiveSpan()` is `undefined` under `ROOT_CONTEXT`.

## Relationships

- **`src/infrastructure/observability/tracer.ts`** — The module under test. Imports `getTracer`, `withSpan`, `getActiveSpanContext`, and `recordErrorOnActiveSpan`.
- **`tests/support/environment.ts`** — Imports `setEnvironment` to simulate `NODE_ENV` values (`development`, `production`) and assert environment-conditional attribute behavior.

## Notes

- Every `describe` block provisions its **own** tracer provider in `beforeEach` and tears it down in `afterEach`, so test isolation does not rely on global setup.
- Production-mode assertions are strict: exception events must contain **only** `exception.type` (no `exception.message`, no `exception.stacktrace`). Development-mode asserts the stacktrace is a non-empty string.
- `withSpan` is tested against both `Promise.reject` and synchronous `throw` paths — the implementation must handle both via `try/catch` before the promise chain.
- `recordErrorOnActiveSpan` is explicitly tested with a **string** argument; the implementation must not assume the value is an `Error` instance.
