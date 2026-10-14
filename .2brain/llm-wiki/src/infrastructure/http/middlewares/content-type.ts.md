---
source: src/infrastructure/http/middlewares/content-type.ts
sha256: cbd7d80867c5fae98c0bf422006a3dfff86f5d5d90464848ccbb372f11b7c4e1
generated_at: 2026-10-14T07:55:32.118494+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/content-type.ts

## Purpose

Express middleware that returns **415 Unsupported Media Type** when a request carries a body whose `Content-Type` is not among the types the matched operation declares. It plugs a gap where `express.json` silently ignores undeclared types, producing an empty `{}` body that an all-optional PATCH schema would accept as a no-op 200.

## Key elements

- **`requireDeclaredContentType(operations)`** *(exported)* — Builds an Express `RequestHandler` from a generated, most-specific-first list of `RequestContentType` operations. For each request it finds the matching operation (method + path pattern), checks whether the request actually carries bytes, and verifies the `Content-Type` via `request.is()`. On mismatch it responds 415 with an `ERROR_CODES.UNSUPPORTED_MEDIA_TYPE` payload listing the accepted types; otherwise it calls `next()`.
- **`carriesBody(request)`** *(module-private)* — Returns `true` if the request uses chunked transfer-encoding or has a `Content-Length` greater than 0. Prevents false positives for body-less POSTs that still carry a `Content-Type` header.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse`, used to emit the structured 415 error body.
- **`src/infrastructure/i18n/index.ts`** — Provides the `t()` helper that localises the `generic.error-unsupported-media-type` message.
- **`tests/unit/infrastructure/http/middlewares/content-type.test.ts`** — Unit tests covering the guard's matching, body-detection, and pass-through logic.

## Notes

- The `operations` array is **ordered by the generator**: static segments before parameterised ones, so `/products/search` is matched before `/products/{id}`. Do not re-sort at the call site.
- A *missing* required body is **not** a 415 here; it falls through to schema validation (422). This middleware only rejects a body that is *present* but in an undeclared media type.
- Routes absent from the operations table are passed through untouched — the middleware is permissive by default.
- `carriesBody` is a deliberate workaround for `type-is` counting `Content-Length: 0` as "has body"; without it, every action POST with a `Content-Type` header but an empty body would be wrongly rejected.
