---
source: src/infrastructure/http/middlewares/request-logger.ts
sha256: 36f50083b713638252503589e5aa4a3c29acdbb4c6ae0193cffbd2279debee47
generated_at: 2026-09-23T17:44:47.187490+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/request-logger.ts

## Purpose

Express access-log middleware that emits exactly one structured log line per completed HTTP request, with sub-millisecond duration (via `process.hrtime.bigint()`) and a severity level derived from the response status code so that 5xx failures log at `error` and 4xx at `warn`.

## Key elements

- **`requestLogger`** (exported function) — The sole export. An Express `(req, res, next)` middleware that:
  - Records a start timestamp before calling `next()`.
  - Attaches a one-time `finish` listener on the response.
  - On finish, computes duration, resolves the route label, maps status → level (`≥500` → `error`, `≥400` → `warn`, else `info`), and calls `logger.log` with a structured metadata object (`request_id`, `trace_id`, `method`, `route`, `status_code`, `duration_ms`).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` instance used to emit the final log entry.
- **`src/infrastructure/observability/metrics-http.ts`** — Provides `getRouteLabel(request)`, which returns the matched Express route template (not the raw URL path).
- **`src/infrastructure/observability/tracer.ts`** — Provides `getActiveSpanContext()` to retrieve the current `traceId` for correlation.
- **`src/app/request-context.ts`** — Expected to have run earlier in the middleware chain, populating `request.requestId` which this middleware reads and includes in the log metadata.
- **`tests/unit/infrastructure/http/middlewares/request-logger.test.ts`** — Unit tests covering the middleware's timing, severity mapping, and log output.

## Notes

- Listens on `response.once('finish')` rather than `'close'` — intentionally logs only responses that were actually sent, not aborted connections.
- `getRouteLabel` is called inside the `finish` handler (i.e., after `next()` and router matching), because Express populates `req.route`/`req.baseUrl` only after the router has matched. Calling it before `next()` would yield an empty or incorrect route.
- `duration_ms` in the metadata is rounded to 2 decimal places; the human-readable message uses 1 decimal place.
- The middleware itself performs no I/O or awaits — it synchronously calls `next()` and defers all log work to the `finish` callback, so it adds zero latency to the request path.
