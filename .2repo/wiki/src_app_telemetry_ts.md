# src/app/telemetry.ts

## Purpose

Express middleware that records per-request latency and in-flight request counts as Prometheus HTTP metrics. It exists to give the service observable request-level performance data without coupling instrumentation logic to individual route handlers.

## Key elements

- **`installTelemetry(app: Express): void`** — The sole export. Registers a single `app.use` middleware that:
  - Increments the in-flight counter on entry.
  - Captures a high-resolution start timestamp (`process.hrtime.bigint()`).
  - On the response `finish` event: decrements the in-flight counter, computes elapsed milliseconds, and calls `recordRequestMetric` with `method`, `route` (via `getRouteLabel`), `statusCode`, and `durationMs`.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Provides all four metric primitives this file calls: `getRouteLabel`, `recordRequestMetric`, `incrementInflight`, `decrementInflight`. The actual metric storage/serialization lives there; this file only sequences the calls.
- **`src/app.ts`** — Expected caller of `installTelemetry(app)`. Must invoke it **before** any route definitions so the middleware timer wraps handlers rather than following them.
- **`package.json`** — Declares the `express` type dependency and the workspace path alias `@infrastructure/observability/metrics-http` used by this file's imports.

## Notes

- **Route label timing is deliberate.** `getRouteLabel(request)` is read inside the `finish` listener, not in the middleware body. `request.route` is only populated after Express completes routing, so reading it synchronously in the middleware would force a guess-from-path fallback for every unmatched path. The file's header comment calls this out explicitly.
- **Mount order matters.** If `installTelemetry` is called after route registration, the middleware will not wrap the handlers and latency will be under-reported. Callers in `src/app.ts` must place it first.
- **`finish` vs. `close`.** The listener is bound to `response.once('finish')`. For aborted or reset connections that never finish, the in-flight counter is **not** decremented — a known trade-off (avoids double-decrement on normal completion) that can leave a stale in-flight count under error conditions.
- Duration is computed in nanoseconds then divided by `1_000_000` to yield milliseconds as a `Number`.
