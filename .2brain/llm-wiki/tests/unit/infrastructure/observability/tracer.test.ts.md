---
source: tests/unit/infrastructure/observability/tracer.test.ts
sha256: fca53f67b265cb4e5dc3487274fbb0badd356e3b225bcb9b91a6d946b8204380
generated_at: 2026-09-23T20:25:17.845242+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/tracer.test.ts

## Purpose

Unit tests for the four public tracing helpers (`getTracer`, `withSpan`, `getActiveSpanContext`, `recordErrorOnActiveSpan`). They verify span lifecycle behavior—creation, attribute tagging, error recording, re-throw semantics, and active-context retrieval—against an in-memory OpenTelemetry exporter so no real backend is required.

## Key elements

- **`setupTestProvider` / `teardownTestProvider`** – Local helpers that create a `NodeTracerProvider` with an `InMemorySpanExporter` + `SimpleSpanProcessor`, register it globally, and shut it down. Each `describe` block calls these in `beforeEach`/`afterEach` for full isolation.
- **`describe('getTracer')`** – Confirms the factory doesn't throw and the returned tracer can start (and end) a span.
- **`describe('withSpan — success')`** – Asserts the callback's return value is passed through, the span is exported with the expected name, and optional attribute objects (third arg) land on the span.
- **`describe('withSpan — error')`** – Verifies the error is re-thrown, the span is still ended and exported, and an `exception` event carrying `exception.message` is recorded.
- **`describe('getActiveSpanContext')`** – Checks that `traceId`/`spanId` are `undefined` outside a span and match 32/16-hex-digit patterns inside one.
- **`describe('recordErrorOnActiveSpan')`** – Confirms it's a no-op when no span is active, records an `exception` event when a span exists, and accepts non-`Error` values (e.g. strings) without throwing.
- **`describe('context baseline')`** – Sanity check that `trace.getActiveSpan()` is `undefined` under `ROOT_CONTEXT`.

## Relationships

- **`src/infrastructure/observability/tracer.ts`** – The sole production dependency. The test imports all four public exports (`getTracer`, `withSpan`, `getActiveSpanContext`, `recordErrorOnActiveSpan`) via the `@infrastructure/observability/tracer` alias and asserts their contract. No other project files are touched.

## Notes

- Every `describe` block owns its provider lifecycle; there is no shared global setup. Forgetting `teardownTestProvider` in `afterEach` would leak the global tracer registration and pollute later tests.
- The `withSpan` error-path tests deliberately swallow the re-thrown rejection with `.catch(() => {})` so the test itself doesn't crash; the re-throw is verified separately in the `rejects.toThrow` assertion.
- `recordErrorOnActiveSpan` is exercised with a plain string to document that it must not assume an `Error` instance—only the `exception.message` attribute is inspected in the span events.
- The in-memory exporter is the only "backend"; no network, no real OTLP collector, no `AsyncLocalStorage` patching beyond what `provider.register()` does.
