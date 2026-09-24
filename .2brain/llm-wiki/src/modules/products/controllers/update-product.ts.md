---
source: src/modules/products/controllers/update-product.ts
sha256: 0db000553c91b8e2bfb6ce81f39ccfbed157c61f37ba6a089e9a2c6a71c2eac2
generated_at: 2026-09-23T19:26:24.766611+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/update-product.ts

## Purpose

Admin handler for `PATCH /products/:id`. It decodes a multipart or JSON request body (including a JSON-encoded `translations` string) and an uploaded image, then delegates to `productService.writeUpdate` for validation and merge. The controller is purely a transport/decoding layer; all business logic lives in the service.

## Key elements

- **`updateProduct`** (exported function) — The sole export. Accepts an Express `Request`/`Response` pair, decodes input, manages upload cleanup, and maps the service result to an HTTP response. No class or module-level state.

## Relationships

- **`src/modules/products/service.ts`** — Calls `productService.writeUpdate(id, payload, callerContext, uploadOpts)` and maps the result with `productService.toProduct(result.data)`.
- **`src/modules/products/routes.ts`** — Registers this handler as the `PATCH /products/:id` route (implied by the module doc and route path in the JSDoc).
- **`src/infrastructure/http/request.ts`** — Uses `readInput` for typed field extraction (ids, booleans, numbers, stringArrays, jsonFields) and `callerContextOf` to build the auth/context argument.
- **`src/infrastructure/http/uploads.ts`** — Uses `readUploadedImage` to obtain `imageUrl`, `thumbnailUrl`, `pendingImageKey`, and the `deleteUpload` cleanup callback.
- **`src/infrastructure/http/response.ts`** — Sends the final `successResponse` or `rejectResponse`.
- **`src/infrastructure/http/errors.ts`** — Falls back to `rejectDatabaseError(response, 'updateProduct', error)` in the `.catch` branch.
- **`src/infrastructure/i18n/index.ts`** — Imports `t` for the missing-`id` error message (`generic.error-missing-data`).
- **`src/types/index.ts`** — Imports `UpdateProductRequest`, `UpdateProductRequestMultipart`, and `Product` for typing the request body and success payload.

## Notes

- **`translations` is a JSON string, not an object.** In multipart form-data a nested object has no representation, so the client sends a JSON-encoded string under the `translations` part. `readInput`'s `jsonFields: ['translations']` option handles the decode before validation. Don't remove or "fix" this without coordinating with the client.
- **Upload cleanup is fail-safe.** Every failure path (missing `id`, service rejection, database error) calls `deleteUpload().catch(() => undefined)` _before_ sending the HTTP response. The `.catch(() => undefined)` prevents an unhandled promise rejection from corrupting an already-sent response.
- **`request.body` is spread into the payload.** In addition to the individually decoded fields, the raw `request.body` is spread first, so any extra keys present on the body are forwarded to the service. The explicitly decoded fields (`price`, `active`, etc.) override the spread.
- **No async/await.** The function returns a promise chain (`.then`/`.catch`) rather than using `async`. The early-return path for missing `id` returns the `deleteUpload()` promise directly.
