---
source: tests/unit/infrastructure/runtime/span-scrub.test.ts
sha256: 0efbff599ae3185f183ae90edb9b27407bb2c7cde4914efe970169ec36496010
generated_at: 2026-11-15T00:25:04.799199+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/span-scrub.test.ts

## Purpose

Unit tests for the `scrubbingExporter` wrapper, verifying that PII-sensitive detail in OpenTelemetry span status messages and exception-event attributes (e.g. a full Mongo duplicate-key message containing an email) is stripped before spans reach the real exporter, while the error type name and all other span structure are preserved.

## Key elements

- **`exported(record)`** — helper that wires `scrubbingExporter` around an `InMemorySpanExporter`, starts a fresh `db.query` span, applies `record` to it, ends the span, and returns the exported copy.
- **`mongoFailure(span)`** — records a realistic Mongoose-style failure: sets an exception event with a `MongoServerError` carrying the `LEAK` message, and sets the span status to `ERROR` with the same message.
- **`describe('scrubbingExporter')`** block — six specs covering:
  - PII (the email) is absent from both `status` and `events`.
  - The error *type* (`MongoServerError`) survives on status.message and `exception.type`.
  - `exception.stacktrace` is removed.
  - Span name, trace ID, and other context are intact in the exported copy.
  - Non-exception events (e.g. `cache.miss`) are passed through unmodified.
  - A healthy (`OK`) span is forwarded unchanged.

## Relationships

- **`src/infrastructure/runtime/span-scrub.ts`** — the module under test; the file imports `scrubbingExporter` (the factory that wraps an inner exporter) and exercises its behavior in isolation.

## Notes

- The test never imports Mongoose or a real MongoDB; the "Mongo instrumentation" shape is simulated inline via `Object.assign(new Error(LEAK), { name: 'MongoServerError' })`. The contract being verified is exporter-side scrubbing, not instrumentation.
- `scrubbingExporter` is used as a *factory* (called with an inner exporter), not as a singleton—each `exported()` call builds a fresh provider chain, so tests are independent.
- The `LEAK` constant deliberately contains an email address; the assertions target its absence rather than a generic "no message" check, making the PII guarantee explicit.
