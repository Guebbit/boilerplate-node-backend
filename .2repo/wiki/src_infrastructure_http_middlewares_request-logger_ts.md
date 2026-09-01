# src/infrastructure/http/middlewares/request-logger.ts

## Purpose

Express access-log middleware that emits exactly one structured log line per completed HTTP request, timed with `process.hrtime.bigint()` for sub-millisecond precision. It derives the log severity from the response status code (5xx → error, 4xx → warn, everything else → info) so infrastructure failures surface at the same level as the code failures they represent.

## Key elements

- **`requestLogger`** (exported) — The sole export. An Express `(req, res, next) => void` middleware. On the `response` `finish` event it computes elapsed ms, resolves the matched route label, picks the severity level, and calls `logger.log` with a structured fields object (`request_id`, `trace_id`, `method`, `route`, `status_code`, `duration_ms`).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` instance used for the final log emission.
- **`src/infrastructure/observability/metrics-http.ts`** — Provides `getRouteLabel(request)`, which returns the matched route template (e.g. `/users/:id`) rather than the concrete path.
- **`src/infrastructure/observability/tracer.ts`** — Provides `getActiveSpanContext()` to attach the current `traceId` to the log entry.
- **`tests/unit/infrastructure/http/middlewares/request-logger.test.ts`** — Unit test covering this middleware's behavior.

## Notes

- Listens on `response.once('finish')`, **not** `'close'` — the log entry describes a response that was actually sent, not a connection that merely closed.
- `getRouteLabel` is called **inside** the `finish` callback (after `next()`), because Express only populates the matched route after the router has processed the request.
- `requestId` is read directly off the Express `request` object; it is expected to be set upstream (e.g. by an id-injecting middleware) before this middleware runs.
- `duration_ms` in the structured fields is rounded to two decimal places, while the human-readable message string uses one decimal place.
