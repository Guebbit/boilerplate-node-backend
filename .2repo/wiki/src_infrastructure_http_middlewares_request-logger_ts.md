# src/infrastructure/http/middlewares/request-logger.ts

## Purpose

Express middleware that emits a single structured access-log entry per HTTP request. It captures method, matched route template, status code, and sub-millisecond duration, then logs at a severity level that distinguishes caller faults (4xx → WARN) from server faults (5xx → ERROR).

## Key elements

- **`requestLogger`** (named export) — the middleware function `(req, res, next) => void`. Records a start timestamp via `process.hrtime.bigint()`, then attaches a one-time `response.once('finish')` handler that computes elapsed time, resolves the route label, picks the log level, and calls `logger.log` with a message string plus structured fields (`request_id`, `trace_id`, `method`, `route`, `status_code`, `duration_ms`). Calls `next()` immediately so downstream handlers run.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — provides the `logger` instance used to emit the access-log entry.
- **`src/infrastructure/observability/metrics-http.ts`** — provides `getRouteLabel(request)` to obtain the matched Express route template (e.g. `/users/:id`) rather than the raw URL.
- **`src/infrastructure/observability/tracer.ts`** — provides `getActiveSpanContext().traceId` so each log line is correlated with its distributed-trace span.
- **`src/app/request-context.ts`** — upstream middleware that populates `request.requestId`, which this file reads for the `request_id` structured field.
- **`tests/unit/infrastructure/http/middlewares/request-logger.test.ts`** — unit tests covering the middleware's log output, level selection, and timing.

## Notes

- The handler listens on **`finish`**, not `close`, intentionally: it describes a response that was actually sent to the client.
- `getRouteLabel` is called *inside* the `finish` callback (after `next()`), because Express only populates the matched route once the router handler has run.
- Severity split is deliberate: 4xx → `warn` (caller's fault), 5xx → `error` (our fault); they must not share a level.
- Duration is computed with `hrtime.bigint()` (nanosecond resolution) then converted to ms. The message string uses `.toFixed(1)` while the structured `duration_ms` field is rounded to 2 decimal places.
