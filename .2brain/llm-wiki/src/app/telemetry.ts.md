---
source: src/app/telemetry.ts
sha256: f6b2fc8e19d6f6928171784abebb9cf089e5559f7b9e67cfd0db68e8aadcd196
generated_at: 2026-11-08T03:14:38.480142+00:00
model: ollama:qwen3.8:27b
---

# src/app/telemetry.ts

## Purpose

Installs a single Express middleware that records per-request latency (histogram) and in-flight request count (gauge) as Prometheus metrics. It must be mounted **before** all route definitions so the timing wraps the full handler chain.

## Key elements

- **`installTelemetry(app: Express): void`** — the sole export. Registers a middleware that:
  - Increments the in-flight gauge on request start, decrements it on the response's `close` event.
  - On the response's `finish` event, computes elapsed time via `process.hrtime.bigint()` and calls `recordRequestMetric` with method, route label, status code, and duration in ms.
- **`@infrastructure/observability/metrics-http`** — source of all four metric primitives (`getRouteLabel`, `recordRequestMetric`, `incrementInflight`, `decrementInflight`). This file contains no metric definitions; it is purely the wiring layer.

## Relationships

- **`src/app.ts`** — caller; invokes `installTelemetry` during app setup, before route registration.
- **`src/infrastructure/observability/metrics-http.ts`** — provides the metric recording helpers and the `getRouteLabel` utility that resolves the Express route template from `request.route`.
- **`tests/unit/app/telemetry.test.ts`** — unit tests covering the middleware's increment/decrement and recording behavior.
- **`package.json`** — defines the `@infrastructure` path alias used by the import.

## Notes

- **`close` vs `finish` for the gauge:** `decrementInflight` is bound to `response.once('close', …)`, *not* `'finish'`. Aborted or streamed (e.g. SSE) responses never emit `finish`, so using it would leak the gauge. `close` always fires.
- **Route label timing:** `getRouteLabel(request)` is called inside the `finish` handler, not at the top of the middleware. `request.route` is only populated after Express finishes routing; reading it in the middleware body would require guessing the template from the raw path.
- **`once` listeners:** Both event registrations use `.once()` to avoid double-decrementing or double-recording if the event somehow fires more than once.
- **No filtering:** The middleware applies to *every* path that hits the Express app (including 404s), because it runs before routing.
