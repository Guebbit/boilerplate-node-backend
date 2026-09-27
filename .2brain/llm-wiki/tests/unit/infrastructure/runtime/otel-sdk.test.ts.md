---
source: tests/unit/infrastructure/runtime/otel-sdk.test.ts
sha256: 4ad0d3a78ccb7d18e219a6f5f48a8658dc01e8ccbdbb541a4265bb4b3d5a69c7
generated_at: 2026-09-27T16:10:03.553286+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/otel-sdk.test.ts

## Purpose

Unit tests for `buildProcessors()` and `redactUrlSecrets()` from the OpenTelemetry SDK module. It deliberately excludes `startTracing()` because that function monkey-patches express/mongoose/redis/http globally and is unsafe inside a Jest worker shared with other test files.

## Key elements

- **`sampledSpanStub()`** — returns a minimal `ReadableSpan` (sampled `traceFlags`, `resource.asyncAttributesPending: false`) via `asStub`, just enough to pass `onEnd`'s sampled check and `_flushOneBatch`'s resource read before `export()` is called.
- **`describe('otel-sdk — buildProcessors')`** — three tests:
  - No endpoint → single `NoopSpanProcessor` is returned (so the SDK still registers a tracer provider and logs keep trace ids).
  - `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` set → processor is *not* a `NoopSpanProcessor`.
  - `OTEL_EXPORTER_OTLP_ENDPOINT` set → a real span reaches `OTLPTraceExporter.prototype.export` at flush time (guards against the deprecated two-arg `BatchSpanProcessor` form where the exporter is silently `undefined` until `_flushAll`).
- **`describe('otel-sdk — redactUrlSecrets')`** — two tests: `code`/`state` query params are replaced with `REDACTED`; URLs without those params are returned unchanged.

## Relationships

- **`src/infrastructure/runtime/otel-sdk.ts`** — the module under test; provides `buildProcessors` and `redactUrlSecrets`.
- **`tests/support/environment.ts`** — supplies `withEnvironment`, which sets an env var for the duration of a callback and restores it, isolating endpoint-based tests.
- **`tests/support/stub.ts`** — supplies `asStub`, used to build the typed `ReadableSpan` fixture without a full SDK import.

## Notes

- The "no endpoint" test asserts `process.env.OTEL_EXPORTER_OTLP_ENDPOINT` is `undefined` as an *ambient* precondition of the suite, not as a fixture it sets itself.
- The flush test spies on `OTLPTraceExporter.prototype.export` (class-level) because `buildProcessors()` constructs its own exporter instance internally; there is no pre-existing instance to spy on.
- The `BatchSpanProcessor` positional-argument trap (old `sdk-trace-node` two-arg form) is a silent-failure mode: spans queue without error and the crash only appears inside `_flushAll()`. The third test pins correct runtime behavior; `ts-check` catches the shape at compile time.
