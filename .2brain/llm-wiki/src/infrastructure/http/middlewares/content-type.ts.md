---
source: src/infrastructure/http/middlewares/content-type.ts
sha256: 2d6919fde13f1fe5f29a0e25870e1e608677e04bd9ff71e55708ac600a4ec4cb
generated_at: 2026-11-08T03:30:22.963669+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/content-type.ts

## Purpose

An Express middleware ("415 guard") that rejects any write request whose `Content-Type` is not among the types declared for the matched operation. It exists to close a silent-failure gap: `express.json` only parses declared types, so an undeclared body arrives as `{}`, which an all-optional PATCH schema happily accepts—returning a 200 that changed nothing. RFC 9110 §15.5.16 prescribes the honest 415 response.

## Key elements

- **`requireDeclaredContentType(operations)`** — the sole export. Accepts a read-only array of `RequestContentType` (method, regex `pattern`, `types`) ordered most-specific-first. Returns an Express `RequestHandler` that:
  1. Normalises the path (strips trailing slash).
  2. Finds the first matching operation (method + pattern).
  3. If the request carries a body *and* the declared types do not include it, responds **415** with `ERROR_CODES.UNSUPPORTED_MEDIA_TYPE`.
  4. Otherwise calls `next()`.
- **`carriesBody(request)`** — internal. Returns `true` when `Transfer-Encoding` is present or `Content-Length > 0`. Guards against `type-is` treating `Content-Length: 0` as a body (which would 415 legitimate empty action POSTs).
- **`acceptsBody(request, types)`** — internal. Requires a non-empty type list, then delegates to `request.is([...types])` (the `type-is` package). Returns `false` when the list is empty (operation takes no body at all).

## Relationships

- **`src/infrastructure/http/response.ts`** — imports `rejectResponse`, the standard error-envelope builder used to emit the 415 body.
- **`src/infrastructure/i18n/index.ts`** (and **`context.ts`**) — imports the `t()` translation function for the user-facing error message.
- **`src/app/security.ts`** — consumes `requireDeclaredContentType` to register the guard in the HTTP security/middleware chain.
- **`tests/unit/infrastructure/http/middlewares/content-type.test.ts`** — unit tests covering the guard's accept/reject logic.

## Notes

- The `operations` array must be ordered most-specific-first (static segments before parameterised ones, e.g. `/products/search` before `/products/{id}`). The codebase's generator is responsible for this ordering; the middleware simply takes the first match.
- An empty `types` array on an operation is deliberately handled *before* calling `request.is()`, because `type-is` returns the request's own type (not `false`) when passed an empty array.
- Requests with no body at all (e.g. `Content-Length: 0` and no `Transfer-Encoding`) are passed through unconditionally; a missing *required* body is the schema's concern (422), not this guard's.
- The middleware is a pure guard: it never parses or mutates the body, only inspects headers.
