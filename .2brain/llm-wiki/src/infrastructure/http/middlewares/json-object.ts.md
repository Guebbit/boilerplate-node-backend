---
source: src/infrastructure/http/middlewares/json-object.ts
source_sha256: 904bd80c98b5ec2bcd34f7617ab3e13fc181c1c7df1869a5a0b9e25223f66f7f
context_sha256: 770a2d3f6cd737fe9813336281e46b676042ac8e10975aa238a3289465703615
generated_at: 2026-11-22T02:50:30.808820+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/json-object.ts

## Purpose
Express middleware that rejects parsed JSON request bodies that are not plain objects. The body parser runs non-strict, so scalars, `null` and arrays can parse successfully. The body readers would turn those into `{}`, which would make a scalar PATCH a silent 200 no-op and a scalar search an unfiltered list. This guard returns a 422 instead.

## Key elements
- `requireJsonObjectBody(request, response, next)`: the only export.
  - It responds with 422 when `request.is(JSON_BODY_TYPES)` is truthy, `request.body !== undefined`, and `!isPlainObject(request.body)`.
  - The response is built with `rejectResponse`. It carries one error with code `VALIDATION_ERROR` (from `@api/error-codes`) and the message `t('generic.error-body-not-object')`.
  - In every other case it calls `next()`.

## Relationships
- `src/app/security.ts`: mounts this middleware. Per the module doc, it skips raw-body (webhook) paths itself, so this file does not handle them.
- `src/infrastructure/http/middlewares/json-depth.ts`: supplies `JSON_BODY_TYPES`, the media types that count as JSON.
- `src/infrastructure/http/response.ts`: supplies `rejectResponse`, which sends the 422.
- `src/infrastructure/object-guards.ts`: supplies `isPlainObject`, the shape check.
- `src/infrastructure/i18n/index.ts`: supplies `t`, which localizes the error message.
- `src/infrastructure/i18n/context.ts`: a graph neighbor, but not imported directly by this file.
- `tests/unit/infrastructure/http/middlewares/json-object.test.ts`: unit tests for this middleware.

## Notes
- The status is 422, not 400 (RFC 5789 §2.2). The JSON is well-formed but the document is unprocessable. Unparseable JSON remains the parser's 400.
- The guard applies to JSON only. A body that no parser read is `undefined` and passes, as does a request with another media type.
