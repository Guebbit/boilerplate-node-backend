---
source: src/infrastructure/http/middlewares/content-type.ts
sha256: ada06dea006f67b48a6218a78fd5be5ce674dc05d1f6ae06bba10af46631e604
generated_at: 2026-11-14T18:01:24.135918+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/content-type.ts

## Purpose

Express middleware that returns **415 Unsupported Media Type** when a request carries a body whose media type is not declared by the matched operation. Without it, `express.json` silently drops unlisted body types, an all-optional PATCH schema accepts the resulting `{}`, and the client receives a misleading 200.

## Key elements

- **`carriesBody(request)`** *(private)* – Returns `true` if the request has a chunked body or a non-zero `Content-Length`. Guards against 415-ing empty action POSTs.
- **`acceptsBody(request, types)`** *(private)* – Wraps `request.is()` with a special case: an empty `types` array (body-less operation) always rejects, because `request.is([])` would return the request's own type rather than `false`.
- **`declaredOperation(operations, method, path)`** *(exported)* – Looks up the matching row in the generated `RequestContentType[]` table (first row whose method matches and whose regex pattern matches the path). Used by both the 415 guard and the `OPTIONS`/`Accept-Patch` responder so both name the same declared types.
- **`requireDeclaredContentType(operations)`** *(exported)* – Factory returning an Express `RequestHandler`. Strips a trailing slash from the path, resolves the operation, and if the request carries a body of an undeclared type, sends a 415 with an `Accept` header (and `Accept-Patch` for PATCH) listing the allowed types. Otherwise calls `next()`.

## Relationships

- **`src/infrastructure/http/response.ts`** – Calls `rejectResponse` to build the 415 response body with the standard error envelope.
- **`src/infrastructure/i18n/index.ts`** – Calls `t()` to internationalize the `UNSUPPORTED_MEDIA_TYPE` error message.
- **`src/app/security.ts`** – Consumes `requireDeclaredContentType` as part of the security/composition layer that wires middlewares onto the Express app.
- **`src/infrastructure/http/middlewares/method-not-allowed.ts`** – Sibling middleware; shares the `declaredOperation` lookup so the 405 and 415 guards agree on which operation a route represents.
- **`tests/unit/infrastructure/http/middlewares/content-type.test.ts`** – Unit tests covering the guard's accept/reject paths and header behaviour.

## Notes

- **Empty-body edge case:** `type-is` (via `request.is`) counts `Content-Length: 0` as a body. `carriesBody` explicitly excludes it so that a client POSTing an action with a content-type header but no bytes is not 415'd.
- **`request.is([])` quirk:** Passing an empty array to `request.is` returns the request's own detected type rather than `false`. The `types.length > 0` check in `acceptsBody` handles this; the empty-list case means "no body allowed" and is always a reject.
- **Table ordering matters:** The generated `operations` array is ordered most-specific-first (static segments before `{param}`), so `/products/search` will not be shadowed by `/products/{id}`.
- **Trailing-slash normalization:** The middleware strips a single trailing slash from `request.path` before pattern matching; the path `/` is left as-is.
- **RFC references in code:** 415 semantics (RFC 9110 §15.5.16), `Accept` header on 415 (§12.5.1), and `Accept-Patch` (RFC 5789 §2.2) are called out in inline comments for traceability.
