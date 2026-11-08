---
source: tests/unit/infrastructure/runtime/otel-sdk.test.ts
sha256: a103d15b0645a97708373705af1cde02d2a40d795ac2f5719e0c2ff8732005c0
generated_at: 2026-11-08T10:23:48.103703+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/otel-sdk.test.ts

## Purpose

Unit tests for the pure, individually-testable exports of `@infrastructure/runtime/otel-sdk` — specifically `buildProcessors()`, `redactUrlSecrets`, `publicEndpointPropagator`, `linkInboundTrace`, and `SERVICE_VERSION`. The file deliberately avoids calling `startTracing()`, which monkey-patches `express`, `mongoose`, `redis`, and `http` globally and would poison other Jest workers.

## Key elements

- **`sampledSpanStub()`** — Minimal `ReadableSpan` (sampled context + `asyncAttributesPending: false`) sufficient to pass the `onEnd` and `_flushOneBatch` guards before the mocked `export()` swallows it.
- **`traceparent(flags)`** — Helper that builds a valid W3C `traceparent` header with a given sampled flag (`01`/`00`).
- **`incoming(headers)`** — Wraps a fresh `IncomingMessage`/`Socket` pair so `linkInboundTrace` receives a recognisable request object.
- **`recordingSpan()`** — Returns a stub `Span` whose `addLink` is a `jest.fn()`, plus that spy, for asserting link calls.
- **`describe('buildProcessors')`** — Three cases: no endpoint → single `NoopSpanProcessor`; traces-specific endpoint → non-noop processor; endpoint set → a real `OTLPTraceExporter.export()` is invoked exactly once after `forceFlush()`.
- **`describe('redactUrlSecrets')`** — Verifies `code` and `state` query params are replaced with `REDACTED` while other params are preserved.
- **`describe('publicEndpointPropagator')`** — Extract ignores inbound `traceparent`/`baggage`; inject still writes `traceparent`; `fields()` returns `['traceparent','tracestate']`; an unsampled (`-00`) remote parent does **not** turn off local sampling.
- **`describe('linkInboundTrace')`** — Valid traceparent → `addLink` called with the remote trace/span ids; unsampled caller still linked; malformed / missing / all-zero trace-id → no link; outgoing `ClientRequest` left alone.
- **`describe('SERVICE_VERSION')`** — Asserts the constant equals `package.json`'s `version` and is not the `0.0.0` placeholder npm injects.

## Relationships

- **`src/infrastructure/runtime/otel-sdk.ts`** — The module under test; every `describe` block exercises one of its exports.
- **`tests/support/stub.ts`** — Provides `asStub<T>()` used to build the minimal `ReadableSpan` and `Span` fakes without pulling in full SDK instances.
- **`tests/support/environment.ts`** — Provides `withEnvironmentOverrides()` so tests that need `OTEL_EXPORTER_OTLP_ENDPOINT` (or the traces-specific variant) restore the ambient env after the assertion.
- **`package.json`** — Imported as a JSON module to compare against `SERVICE_VERSION` at test time, ensuring the constant tracks the published version.

## Notes

- The file's header comment explains *why* `startTracing()` is excluded: it patches `express`/`mongoose`/`redis`/`http` prototypes, which is unsafe when Jest shares a worker across test files.
- The `exportSpy` is attached to `OTLPTraceExporter.prototype` (not an instance) because `buildProcessors()` constructs its own exporter internally; there is no external handle to spy on beforehand.
- The `buildProcessors` "drops every span" case asserts `process.env.OTEL_EXPORTER_OTLP_ENDPOINT` is `undefined` as an **ambient precondition**, not a fixture the test sets — this documents the suite-level default.
- The propagator "unsampled traceparent" test encodes a security invariant: a caller sending `flags=00` must not disable our own sampling; the resulting span gets a *new* trace id, not the caller's.
- `redactUrlSecrets` only masks known sensitive params (`code`, `state`); unrelated query strings pass through unchanged.
