---
source: src/infrastructure/http/middlewares/request-logger.ts
sha256: 8f053cf45079942206ae843dbbb28d985f4182c6d853f753d6475fa3e5ba5e4d
generated_at: 2026-10-14T07:58:26.848156+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/request-logger.ts

## Purpose

Express access-log middleware that emits exactly one structured log entry per HTTP request. It measures duration with `hrtime` (sub-ms precision) and maps the response status code to a log severity (5xx → error, 4xx → warn, else info) so failures are surfaced at the appropriate alerting level.

## Key elements

- **`requestLogger`** (exported) — The sole export. An Express middleware `(req, res, next) => void`. Starts a `hrtime.bigint()` timer, attaches a `once('finish')` listener on the response, then calls `next()` immediately. On finish it computes duration, resolves the route label and trace context, and writes a single `logger.log` call with both a human-readable message and a structured metadata object (`requestId`, `clientRequestId`, `traceId`, `method`, `route`, `statusCode`, `durationMs`).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Consumes the shared `logger` singleton to emit the log line at the derived severity level.
- **`src/infrastructure/observability/metrics-http.ts`** — Calls `getRouteLabel(request)` to resolve the matched Express route template (e.g. `/users/:id`) rather than the concrete path.
- **`src/infrastructure/observability/tracer.ts`** — Calls `getActiveSpanContext()` to attach the current W3C `traceId` to the log entry.
- **`src/app/request-context.ts`** — The middleware reads `request.requestId` and `request.clientRequestId` that are (by convention) assigned upstream by the request-context middleware before this one runs.
- **`tests/unit/infrastructure/http/middlewares/request-logger.test.ts`** — Unit tests covering log level mapping, duration calculation, and the shape of the structured fields.

## Notes

- The log entry fires on the **`finish`** event, not `close`. This intentionally excludes aborted/sent-but-never-finished responses from the access log.
- `getRouteLabel` is read inside the `finish` callback (after `next()`), because Express only populates the matched route on the request object once routing is complete.
- Duration is formatted to 1 decimal place in the message but rounded to 2 decimal places in the structured `durationMs` field.
- The middleware never throws and never short-circuits; it always calls `next()` synchronously.
