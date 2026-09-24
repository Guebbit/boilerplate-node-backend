---
source: tests/unit/infrastructure/runtime/otel-sdk.test.ts
sha256: c64d014d527d4d251310834c7198e376aa482fdef706269a94aff58663f03606
generated_at: 2026-09-23T20:26:19.230434+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/otel-sdk.test.ts

## Purpose

Unit tests for `buildProcessors()` specifically — deliberately excluding `startTracing()` because that function monkey-patches express, mongoose, redis, and http globally, which is unsafe inside a shared Jest worker. The tests verify the no-op path and that a finished span actually reaches a real `OTLPTraceExporter.export()` at flush time.

## Key elements

- **`sampledSpanStub()`** — Returns a minimal `ReadableSpan` stub (via `asStub`) with just `spanContext()` (returning `TraceFlags.SAMPLED`) and `resource.asyncAttributesPending: false`. Nothing else is read before the mocked `export()` call.
- **Test: "is a no-op without OTEL_EXPORTER_OTLP_ENDPOINT"** — Asserts the env var is unset (suite ambient default, not a fixture) and that `buildProcessors()` returns `[]`.
- **Test: "forwards a finished span to a real exporter at flush time"** — Spies on `OTLPTraceExporter.prototype.export` (not an instance, since `buildProcessors()` constructs its own internally), sets the endpoint via `withEnvironment`, calls `processor.onEnd(sampledSpanStub())` + `forceFlush()`, then asserts `export()` was called once.

## Relationships

- **`src/infrastructure/runtime/otel-sdk.ts`** — Imports `buildProcessors()` under test. Only that function is exercised; `startTracing()` is intentionally not touched.
- **`tests/support/environment.ts`** — Imports `withEnvironment` to temporarily set `OTEL_EXPORTER_OTLP_ENDPOINT` for the duration of one `async` callback, restoring it afterward.
- **`tests/support/stub.ts`** — Imports `asStub` to construct a typed, partial `ReadableSpan` object without implementing the full interface.

## Notes

- The module doc-block documents a specific API break: `BatchSpanProcessor` (from `@opentelemetry/sdk-trace`) takes a single options object `{ exporter, … }`, unlike the deprecated `sdk-trace-base` two-argument form. Passing the exporter positionally leaves `options.exporter` undefined, causing a silent failure that only surfaces inside `_flushAll()` when it calls `undefined.export(...)`. This test pins correct runtime behaviour beyond what `ts-check` enforces.
- The `export` spy is attached to the **prototype**, because `buildProcessors()` constructs its own `OTLPTraceExporter` internally — there is no instance to pre-spy. Remember `mockRestore()` after the assertion.
- The "no-op" test relies on `OTEL_EXPORTER_OTLP_ENDPOINT` being absent from the ambient test environment; it is not set or unset by the test itself.
