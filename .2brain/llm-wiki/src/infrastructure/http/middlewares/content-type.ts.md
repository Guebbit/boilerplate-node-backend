---
source: src/infrastructure/http/middlewares/content-type.ts
sha256: 0b4283f4bd5133e44c160950b45ab6687a5ee5a9f0ad339e8b04206edbe5b5c6
generated_at: 2026-10-29T02:02:13.349589+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/content-type.ts

## Purpose

Express middleware that returns **415 Unsupported Media Type** when a write request carries a body whose `Content-Type` is not declared by the matched operation. Without it, `express.json` would leave an undeclared body as `{}`, and an all-optional PATCH schema would accept that — producing a misleading 200 that changed nothing.

## Key elements

- **`carriesBody(request)`** (private) — Returns `true` only when the request actually sends bytes (chunked encoding or `Content-Length > 0`). Needed because `type-is` treats `Content-Length: 0` as a body, which would 415 action POSTs that legitimately carry no payload.
- **`acceptsBody(request, types)`** (private) — Returns `true` when the request's type is in the declared list. Handles the empty-list case (operation takes no body) explicitly, since `request.is([])` returns the request's own type rather than `false`.
- **`requireDeclaredContentType(operations)`** (exported) — Factory that returns an Express `RequestHandler`. Matches the request path/method against the generated operation table, then rejects with 415 if a body is present but its type is undeclared.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse`, used to emit the structured 415 error body.
- **`src/infrastructure/i18n/index.ts`** (re-exporting `context.ts`) — Provides `t()` for the localized error message string.
- **`src/app/security.ts`** — Consumes this middleware, wiring `requireDeclaredContentType` into the application's request pipeline with the generated operation table.
- **`tests/unit/infrastructure/http/middlewares/content-type.test.ts`** — Unit tests covering the guard's accept/reject logic.

## Notes

- The `operations` array must be ordered **most-specific first** (static segments before parameters). The factory relies on `Array.find` returning the first match, so `/products/search` must precede `/products/{id}`. The generator is expected to guarantee this ordering.
- A *missing* required body is intentionally **not** handled here; that is the schema validator's 422. This guard only fires when a body is present but of the wrong type.
- Routes absent from the operations table are passed through untouched (`next()`).
- The error `details` field includes the list of accepted types, so clients can self-correct.
