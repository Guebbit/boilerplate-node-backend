---
source: src/app/telemetry.ts
sha256: f6b2fc8e19d6f6928171784abebb9cf089e5559f7b9e67cfd0db68e8aadcd196
generated_at: 2026-09-27T14:03:26.919434+00:00
model: ollama:qwen3.8:27b
---

# src/app/telemetry.ts

## Purpose

Installs a single Express middleware that records per-request latency (histogram) and in-flight request count (gauge) as Prometheus metrics. It is mounted *before* the route table so the timer wraps the entire handler chain rather than just the matched handler.

## Key elements

- **`installTelemetry(app: Express): void`** — The sole export. Registers one `app.use` middleware that:
  - Calls `incrementInflight()` on request entry and wires `decrementInflight` to the response `close` event.
  - Captures a `process.hrtime.bigint()` start time; on the response `finish` event computes elapsed ms and calls `recordRequestMetric` with `method`, `route` (via `getRouteLabel`), `statusCode`, and `durationMs`.

## Relationships

- **`src/app.ts`** — Calls `installTelemetry(app)` during application setup, placing this middleware ahead of all route registrations.
- **`src/infrastructure/observability/metrics-http.ts`** — Supplies the four metric primitives this file consumes: `getRouteLabel`, `recordRequestMetric`, `incrementInflight`, `decrementInflight`.
- **`tests/unit/app/telemetry.test.ts`** — Unit-tests the middleware behavior (in-flight gauge transitions, metric recording on finish).
- **`package.json`** — Declares the `express` and `@infrastructure/observability` dependencies this file imports.

## Notes

- **`close` vs `finish` for the gauge:** `decrementInflight` is bound to the response `close` event, not `finish`. Aborted or streamed (SSE) responses never fire `finish`; `close` always fires, preventing the in-flight gauge from leaking.
- **Route label deferred to `finish`:** `request.route` is populated only after routing completes. Reading it in the middleware body would require guessing a template from the raw path, producing unbounded label cardinality for unmatched paths. Reading it in the `finish` callback sidesteps that.
- **Single-`once` wiring:** Both `close` and `finish` listeners use `.once()` so repeated emissions (e.g. `close` after `finish`) don't double-decrement the gauge.
