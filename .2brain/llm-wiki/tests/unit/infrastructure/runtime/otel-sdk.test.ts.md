---
source: tests/unit/infrastructure/runtime/otel-sdk.test.ts
sha256: 6c2ea4ad6d3a41e4328a4a5168cf54d9ff2c051bfa88357e844c243c0d859300
generated_at: 2026-10-15T13:19:31.622417+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/otel-sdk.test.ts

## Purpose

Unit tests for four exported helpers in `otel-sdk.ts` — `buildProcessors`, `redactUrlSecrets`, `publicEndpointPropagator`, and `linkInboundTrace`. The file deliberately skips `startTracing()` because that function monkey-patches express, mongoose, redis, and http globally, making it unsafe inside a shared Jest worker. These tests verify that the SDK wiring, URL-secret masking, propagation security, and inbound-trace linking all behave correctly in isolation.

## Key elements

- **`sampledSpanStub()`** – Returns a minimal `ReadableSpan` (sampled flags + pending-attribute flag) sufficient for `onEnd` and `_flushOneBatch` to reach a mocked `export()`.
- **`describe('otel-sdk — buildProcessors')`** – Three cases: no endpoint yields a single `NoopSpanProcessor`; a traces-specific endpoint yields a real processor; a finished span actually reaches `OTLPTraceExporter.prototype.export` at flush time.
- **`describe('otel-sdk — redactUrlSecrets')`** – Verifies OAuth `code`/`state` params are replaced with `REDACTED` while other query params are untouched.
- **`traceparent(flags)`** – Helper that builds a valid W3C traceparent string with a given sampled flag (`01` or `00`).
- **`incoming(headers)`** – Wraps a bare `IncomingMessage` with the supplied header object.
- **`describe('otel-sdk — publicEndpointPropagator')`** – Confirms the propagator extracts no remote context, drops inbound baggage, still injects `traceparent` on outgoing calls, declares its fields, and yields a sampled root span even when the caller sent an unsampled (`-00`) traceparent.
- **`recordingSpan()`** – Returns a stubbed `Span` whose `addLink` is a `jest.fn`, plus the spy itself, for assertions on `linkInboundTrace`.
- **`describe('otel-sdk — linkInboundTrace')`** – Covers valid traceparent linking, unsampled-caller linking, rejection of missing/malformed/all-zero traceparents, and that outgoing `ClientRequest` objects are ignored.

## Relationships

- **`src/infrastructure/runtime/otel-sdk.ts`** – The module under test; the file imports `buildProcessors`, `linkInboundTrace`, `publicEndpointPropagator`, and `redactUrlSecrets` from it.
- **`tests/support/stub.ts`** – Provides `asStub<T>()` used to build minimal `ReadableSpan` and `Span` objects.
- **`tests/support/environment.ts`** – Provides `withEnvironment(key, value, fn)` to scope `OTEL_EXPORTER_OTLP_*` env-var mutations to a single test.

## Notes

- The `OTLPTraceExporter` spy is attached to the **class prototype**, not an instance, because `buildProcessors()` constructs its own exporter internally — there is no external handle to intercept.
- The propagator's "unsampled caller" test encodes a security requirement: an external `-00` traceparent must not disable the server's own sampling decision. The test asserts the new span keeps the `SAMPLED` flag *and* gets a fresh trace ID.
- The "no endpoint" test asserts exactly **one** processor (the `NoopSpanProcessor`) rather than zero, because zero processors means no tracer provider is registered and log lines lose trace IDs.
- `withEnvironment` is called as `await withEnvironment(..., () => { ... })` in the traces-endpoint case (returning `Promise.resolve()`) but as `await withEnvironment(..., async () => { ... })` in the flush case — both forms are supported by the helper.
