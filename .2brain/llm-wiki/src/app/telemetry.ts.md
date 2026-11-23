---
source: src/app/telemetry.ts
source_sha256: 7ea844d31ba7aff8c7f31f4e1a0f64cf4106e881b814a1d142cdab2aab8dc5f6
context_sha256: 96474351fd91fc59acdabba55eafd6fc083514c2b391ed2492e480881a75797a
generated_at: 2026-11-22T02:31:59.512536+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/telemetry.ts

## Purpose
Installs Prometheus HTTP metrics on an Express app: per-request latency and an in-flight request gauge. It is meant to be mounted before the routes so the timer wraps the handler instead of running after it.

## Key elements
- `installTelemetry(app: Express): void` is the only export. It registers one middleware via `app.use` that does the following:
  - Calls `incrementInflight()` and records a start time with `process.hrtime.bigint()`.
  - Registers `decrementInflight` on the response's `close` event, using `once`.
  - Registers a `finish` listener on the response, using `once`. It computes the elapsed time in milliseconds and calls `recordRequestMetric({ method, route, statusCode, durationMs })`. The route comes from `getRouteLabel(request)`.
  - Calls `next()`.

## Relationships
- `src/infrastructure/observability/metrics-http.ts` supplies `getRouteLabel`, `recordRequestMetric`, `incrementInflight` and `decrementInflight`. This file only wires them to the request lifecycle. It does not define the metrics themselves.
- `src/app.ts` is a graph neighbor and presumably calls `installTelemetry`. That call is not visible in this file.
- `tests/unit/app/telemetry.test.ts` is the unit test for this module.
- `package.json` is a graph neighbor. This file shows no direct interaction with it.

## Notes
- The in-flight gauge is decremented on `close`, not `finish`. Aborted requests and streamed responses such as SSE never emit `finish`, so decrementing there would leave the gauge permanently too high. `close` always fires.
- Latency and the metric record are emitted on `finish`. Requests that abort or stream without finishing are therefore counted in the gauge but get no latency record.
- The route label is read inside the `finish` listener, not in the middleware body. `request.route` is only populated during routing. Reading it earlier would mean guessing the template from the path, which gives unbounded label values for paths the app doesn't serve.
- The middleware must be registered before the routes so it wraps handlers.
