---
source: src/infrastructure/http/middlewares/request-logger.ts
source_sha256: eeebb7233949fc2b97649cc6fff1454dbb29cc929797a45fd2be12966b349c9f
context_sha256: c97bd976e517e22ab167baa215034701c6d3539d0966e0bd77ad2ac20c1c1d41
generated_at: 2026-11-22T02:52:08.781054+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/request-logger.ts

## Purpose
Express middleware that writes one access-log entry per request. It times each request with `process.hrtime.bigint()` for sub-millisecond precision and picks the log severity from the response status code, so server failures are as visible as they should be.

## Key elements
- `requestLogger(request, response, next)`: the only export.
  - Records a start time, then registers a `response.once('finish', ...)` listener and calls `next()` immediately.
  - On `finish`, it computes the duration in ms, reads the route label and status code, and logs through `logger.log(level, message, meta)`.
  - Level: `error` for status >= 500, `warn` for >= 400, otherwise `info`.
  - Message format: `"<METHOD> <route> <status> <duration>ms"`, with the duration to 1 decimal place.
  - Structured metadata: `requestId`, `clientRequestId`, `method`, `route`, `statusCode`, and `durationMs`, rounded to 2 decimal places.

## Relationships
- `@infrastructure/adapters/logger` (`src/infrastructure/adapters/logger.ts`): supplies the `logger` that receives the entry.
- `@infrastructure/observability/metrics-http` (`src/infrastructure/observability/metrics-http.ts`): supplies `getRouteLabel(request)`, which gives the route label used in the message and metadata.
- `tests/unit/infrastructure/http/middlewares/request-logger.test.ts`: unit tests for this middleware.

## Notes
- The listener uses `finish`, not `close`, so only responses that were actually sent are logged. Aborted connections that never finish produce no entry.
- The route label is read inside the `finish` handler rather than before `next()`. Express has populated the matched route by then, and the label is the route template, not the concrete path.
- The `finish` handler must remain the place where the route is resolved. Reading it earlier would not give the matched template.
