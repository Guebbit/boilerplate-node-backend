---
source: src/infrastructure/http/middlewares/content-type.ts
source_sha256: 20fedb2aa7beb6d01cb31c5de5664f4f843f82590be6442c8b45b78eaa23adf7
context_sha256: ed6135e3c62fe7466bf106ac9a42d4b08d256dcde9b57c16db46c60aea796a99
generated_at: 2026-11-22T02:49:17.070752+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/content-type.ts

## Purpose
Implements the 415 guard: a write request whose body is in a media type the operation does not declare is refused. It exists because the JSON body parser only handles the types it is told to. Any other body arrives as `{}`, and an all-optional PATCH schema would accept that as a 200 that changed nothing. Per the file's own comments, RFC 9110 §15.5.16 names the honest answer.

## Key elements
- `requireDeclaredContentType(operations)`: factory that returns an Express `RequestHandler`. It normalizes the path (strips a trailing slash unless the path is `/`) and looks up the operation. If an operation is found, the request carries a body, and the type is not accepted, it answers 415. Otherwise it calls `next()`.
- `declaredOperation(operations, method, path)`: exported lookup that returns the first row whose `method` equals the request method and whose `pattern` matches the path, or `undefined`. The table is ordered with the fewest `{param}` segments first, so a literal path wins over a templated one.
- `carriesBody` (internal): true when `Transfer-Encoding` is present or `Content-Length` is greater than 0. It avoids type-is's behavior of counting `Content-Length: 0` as a body, which would 415 body-less action POSTs that send a content type.
- `acceptsBody` (internal): returns `false` for any body on an operation with no declared types. Otherwise it uses `request.is([...types]) !== false`. The empty case is decided explicitly because `request.is([])` would return the request's own type.

## Relationships
- `src/infrastructure/http/response.ts`: `rejectResponse(response, 415, [...])` builds the error response.
- `src/infrastructure/i18n/index.ts`: exports `t`, used to supply the localized message for the 415.
- `declaredOperation` is shared with the `OPTIONS` answer's `Accept-Patch`, so both name the same list. The `OPTIONS` handler's file is not shown here.
- `tests/unit/infrastructure/http/middlewares/content-type.test.ts` is the unit test for this module.
- `src/app/security.ts`, `src/infrastructure/http/middlewares/method-not-allowed.ts` and `src/infrastructure/i18n/context.ts` are graph neighbors, but this file does not import them directly.

## Notes
- Only requests that carry a body are judged. A body-less action POST passes, and a missing required body is left to the schema's own 422.
- Routes absent from the table are not touched.
- On rejection, the 415 sets an `Accept` header listing the declared types. For PATCH it also sets `Accept-Patch`. Neither header is set for a body-less operation, which has no types to list.
- The error `details` carry the accepted types, which is empty for a body-less operation.
- Ordering of the operations table matters: the generator must put static segments before parameters, for example so `/products/search` is never read as `/products/{id}`.
