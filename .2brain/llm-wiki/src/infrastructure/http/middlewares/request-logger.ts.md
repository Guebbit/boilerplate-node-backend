---
source: src/infrastructure/http/middlewares/request-logger.ts
sha256: 8f053cf45079942206ae843dbbb28d985f4182c6d853f753d6475fa3e5ba5e4d
generated_at: 2026-11-08T03:32:43.645557+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/request-logger.ts

## Purpose

Express middleware that emits exactly one structured access-log line per HTTP request. Duration is measured with `process.hrtime.bigint()` for sub-millisecond precision, and the log severity is derived from the response status code so that server errors (5xx) surface at `error` level while client errors (4xx) surface at `warn`.

## Key elements

- **`requestLogger`** (exported const) — The sole middleware function. Records a start timestamp, attaches a one-shot `response.once('finish', …)` handler that computes elapsed ms, resolves the route label, picks the log level, and calls `logger.log(…)`. Immediately calls `next()`.
- **Log level mapping** — `statusCode ≥ 500` → `error`; `≥ 400` → `warn`; otherwise → `info`. The distinction is deliberate: 5xx is the server's fault, 4xx is the caller's.
- **Structured fields** — Each log entry carries `requestId`, `clientRequestId`, `traceId`, `method`, `route` (matched template, not concrete path), `statusCode`, and `durationMs` (rounded to 2 dp).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports the shared `logger` singleton; calls `logger.log(level, message, fields)` to emit the access-log entry.
- **`src/infrastructure/observability/metrics-http.ts`** — Imports `getRouteLabel(request)` to resolve the matched Express route template (e.g. `/users/:id`) for the log line.
- **`src/infrastructure/observability/tracer.ts`** — Imports `getActiveSpanContext()` to extract the current `traceId` and correlate the log entry with distributed traces.
- **`src/app/request-context.ts`** — The source of `request.requestId` and `request.clientRequestId` that this middleware reads from the request object when emitting the log entry.
- **`tests/unit/infrastructure/http/middlewares/request-logger.test.ts`** — Unit tests covering the middleware's timing, severity mapping, and log-payload shape.

## Notes

- Hooks into `response.once('finish')`, **not** `'close'`. `finish` fires only when the response has been fully sent; `close` can also fire on aborted/destroyed sockets, which would log a phantom entry.
- `getRouteLabel(request)` is read **inside** the `finish` callback (i.e. after `next()` has run), because that is when Express has populated the matched route on the request. Reading it before `next()` would yield an empty or wrong label.
- Duration is computed as a `BigInt` nanosecond delta, converted to a float ms value, and rounded to 2 decimal places in the structured `durationMs` field. The human-readable message uses `.toFixed(1)`.
- The middleware is intentionally side-effect-light: it performs no mutation of the response and does not interfere with downstream error handling.
