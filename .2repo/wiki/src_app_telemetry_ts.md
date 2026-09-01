# src/app/telemetry.ts

## Purpose
Installs a single Express middleware that records per-request latency and in-flight request counts as Prometheus metrics. It exists to provide observability into request duration and concurrency without requiring instrumentation at every route handler.

## Key elements
- **`installTelemetry(app: Express): void`** (exported) — Registers an `app.use` middleware that, on each request, increments the in-flight gauge, captures a high-resolution start time, and attaches a `response.once('finish')` listener that decrements the gauge and records a labelled histogram (`method`, `route`, `statusCode`, `durationMs`) via `recordRequestMetric`.

## Relationships
- **`src/infrastructure/observability/metrics-http.ts`** — Provides the four primitives consumed here: `incrementInflight`, `decrementInflight`, `recordRequestMetric`, and `getRouteLabel`. This file is purely a caller; all metric naming, label construction, and Prometheus registry wiring live in that module.
- **`src/app.ts`** — Expected to call `installTelemetry(app)` after creating the Express instance and **before** registering route definitions, so the middleware wraps every downstream handler.

## Notes
- The route label is deliberately read inside the `finish` callback, not in the middleware body. `request.route` is only populated after routing completes; reading it earlier would force a path-based guess that produces an unbounded label set for unmatched paths.
- The middleware must be mounted **before** any `app.get`/`app.post` calls. If placed after routes, the timer would not wrap the handler and latency would under-report.
- `process.hrtime.bigint()` is used for sub-microsecond timing; the final value is divided by 1 000 000 to convert nanoseconds → milliseconds.
