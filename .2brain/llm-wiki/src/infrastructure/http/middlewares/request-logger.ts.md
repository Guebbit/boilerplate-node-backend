---
source: src/infrastructure/http/middlewares/request-logger.ts
sha256: 008dd7d774984f6f538d626ecd415e7f1c94b679a7677ff8d86d62c6fe761c67
generated_at: 2026-11-14T18:04:06.669816+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/request-logger.ts

## Purpose

Express middleware that emits a single structured access-log line per HTTP request. It measures duration with `process.hrtime.bigint()` for sub-millisecond precision and derives log severity from the response status (5xx → `error`, 4xx → `warn`, otherwise `info`) so that server-side failures are as loud as the error they accompany.

## Key elements

- **`requestLogger`** (exported const) — the middleware function. Captures a `bigint` start timestamp, hooks `response.once('finish', …)`, then on finish computes elapsed ms, resolves the route label, selects the severity level, and calls `logger.log(level, message, meta)`. Calls `next()` immediately so it does not block the pipeline.
- Log metadata always includes: `requestId`, `clientRequestId`, `method`, `route` (matched template, not raw path), `statusCode`, and `durationMs` (rounded to 2 dp).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — imported as `logger`; the single sink for the access-log entry.
- **`src/infrastructure/observability/metrics-http.ts`** — imported as `getRouteLabel`; converts the request into a normalized route template so the log line matches the label used by metrics.
- **`src/app/request-context.ts`** — not imported directly, but the middleware reads `requestId` and `clientRequestId` off the `Request` object, which are expected to have been attached upstream by the request-context middleware.
- **`tests/unit/infrastructure/http/middlewares/request-logger.test.ts`** — unit tests covering the middleware's logging behavior, severity mapping, and duration calculation.

## Notes

- The log is emitted on `response` `'finish'`, **not** `'close'`. This guarantees the entry only fires for responses that were actually sent; a premature socket abort (e.g. client disconnect) will not produce a spurious log line.
- `getRouteLabel(request)` is called **inside** the `finish` callback, not before `next()`, because Express only populates `req.route` / the matched path after the router middleware chain runs.
- Severity split: 4xx is the caller's fault (`warn`), 5xx is ours (`error`). They deliberately do not share a level so alerting rules can distinguish the two.
- Duration is rounded to 2 decimal places in the structured metadata (`Math.round(durationMs * 100) / 100`) but formatted with 1 decimal in the human-readable message string.
