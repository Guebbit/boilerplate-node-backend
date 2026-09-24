---
source: src/app/telemetry.ts
sha256: 04819b1040048eb70bc6d4cf3480ad182a5758d03f1474a83e72410ef753ca49
generated_at: 2026-09-23T17:36:28.141312+00:00
model: ollama:qwen3.8:27b
---

# src/app/telemetry.ts

## Purpose

Installs a single Express middleware that records per-request latency and in-flight request counts as Prometheus metrics. It exists to provide HTTP observability without coupling metric logic to any individual route handler.

## Key elements

- **`installTelemetry(app: Express): void`** — The sole export. Registers a `next`-style middleware that:
  - Calls `incrementInflight()` on request start.
  - Captures a `process.hrtime.bigint()` timestamp.
  - On the response `finish` event, calls `decrementInflight()` and `recordRequestMetric()` with `method`, `route` (via `getRouteLabel`), `statusCode`, and `durationMs`.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Source of all four metric primitives imported here (`getRouteLabel`, `recordRequestMetric`, `incrementInflight`, `decrementInflight`). This file is a thin wiring layer; the actual Prometheus gauge/histogram definitions live in that module.
- **`src/app.ts`** — Expected caller that invokes `installTelemetry(app)` during Express app setup, placing the middleware ahead of route definitions.
- **`package.json`** — Provides the `express` runtime dependency from which the `Express` type is imported.

## Notes

- **Mount order matters.** The module doc comment states this middleware must be mounted *before* routes so the timer wraps the handler execution rather than measuring only post-handler work.
- **Route label timing.** `getRouteLabel(request)` is called inside the `finish` listener, not in the middleware body. `request.route` is only populated once Express has completed routing; reading it earlier would require parsing the raw path and would produce unbounded label cardinality for unmatched paths.
- **Single-fire guarantee.** The `finish` handler is attached with `response.once`, so the metric is recorded exactly once per request even if `finish` were (hypothetically) re-emitted.
