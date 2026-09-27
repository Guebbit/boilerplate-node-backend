---
source: tests/unit/infrastructure/observability/tracer.test.ts
sha256: b0845e8fcbab5c0b7fa87c9fada32864c13ba98c83307c56d6ab31d8900d54ce
generated_at: 2026-09-27T16:09:06.298074+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/tracer.test.ts

## Purpose
Unit tests for the OpenTelemetry tracing utilities exported by `src/infrastructure/observability/tracer.ts`. Verifies that each public helper (`getTracer`, `withSpan`, `getActiveSpanContext`, `recordErrorOnActiveSpan`) behaves correctly on both the happy path and the error path, using an in-memory exporter so no real telemetry backend is needed.

## Key elements
- **`setupTestProvider` / `teardownTestProvider`** — local helpers that create a `NodeTracerProvider` wired to an `InMemorySpanExporter` (via `SimpleSpanProcessor`) and register/shutdown the global provider. Each `describe` block calls them in `beforeEach`/`afterEach` so tests stay isolated.
- **`describe('getTracer')`** — asserts the function doesn't throw and that the returned tracer can start and end a span.
- **`describe('withSpan — success')`** — verifies the callback return value is resolved, the span is exported with the correct name, and the optional third-argument attributes are attached.
- **`describe('withSpan — error')`** — covers async rejection, synchronous throw, span still being ended, and an `exception` event being recorded with `exception.message`.
- **`describe('getActiveSpanContext')`** — confirms `traceId`/`spanId` are `undefined` outside a span and match the expected hex formats (`32`/`16` hex chars) inside one.
- **`describe('recordErrorOnActiveSpan')`** — confirms it is a no-op when no span is active, records an `exception` event when one is, and does not throw when passed a non-`Error` value (e.g. a string).
- **`describe('context baseline')`** — sanity check that `trace.getActiveSpan()` is `undefined` under `ROOT_CONTEXT`.
- **`throwing`** — a tiny helper that throws synchronously (used to test the sync-throw path of `withSpan`).

## Relationships
- **`src/infrastructure/observability/tracer.ts`** — the sole module under test; this file imports all four public exports from it and exercises them against a real (in-memory) OpenTelemetry SDK provider.

## Notes
- Tests rely on `provider.register()` mutating the **global** tracer provider, so order matters: `afterEach` must call `provider.shutdown()` **and** `trace.disable()` to avoid leaking state into the next test file. If tests run in parallel across workers this is fine, but within a single worker a missed teardown will silently affect subsequent suites.
- The `withSpan` error tests use `.catch(() => {})` to swallow the rejection before inspecting the exporter; this is intentional—assertions are on the exported span data, not on the thrown value (which is asserted separately via `rejects.toThrow`).
- `recordErrorOnActiveSpan` is deliberately tested with a plain string to lock in the "graceful handling of non-Error inputs" contract.
