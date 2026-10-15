---
source: src/modules/products/controllers/create-product.ts
sha256: 3f643f6db077a9c85cdc1d3a765bcbfbed8765c0fb5e949a8fefd880cd21a54d
generated_at: 2026-10-15T11:39:58.185014+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/create-product.ts

## Purpose

Admin-facing controller that handles `POST /products`. It decodes a mixed JSON/multipart request body (scalar fields + `translations` JSON), reads an optional image upload, validates the assembled payload against the Zod schema, and delegates the actual write to `productService.writeCreate`.

## Key elements

- **`createProduct`** (exported function, signature `(request, response) => void`)
  - Parses typed fields (`booleans`, `numbers`, `stringArrays`, `jsonFields`) via `readInput`.
  - Reads the image upload (`imageUrl`, `thumbnailUrl`, `pendingImageKey`) via `readUploadedImage`; `pendingImageKey` is `undefined` when no image is supplied.
  - Validates the full body with `parseBody(productService.zodProductCreateSchema, …)`; on 422 the function returns early.
  - Calls `productService.writeCreate(body, callerContextOf(request), { imageUrl, thumbnailUrl, pendingImageKey })`.
  - On success: `claimUpload(request)`, maps result to a `Product` via `productService.toProduct`, responds `201` with a `Location` header.
  - On service-level refusal (`!result.success`): responds with the returned status + errors; the upload is cleaned up by the middleware close hook.
  - On unhandled error: `rejectDatabaseError` sends a 500.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/products/services/index.ts` | Imports `productService`; calls `writeCreate`, `zodProductCreateSchema`, `toProduct`. |
| `src/infrastructure/http/controller.ts` | Imports `parseBody` for Zod validation. |
| `src/infrastructure/http/request.ts` | Imports `readInput` (typed field decoding) and `callerContextOf` (caller metadata). |
| `src/infrastructure/http/uploads.ts` | Imports `readUploadedImage` (extract image metadata) and `claimUpload` (prevent close-hook deletion on success). |
| `src/infrastructure/http/response.ts` | Imports `createdResponse` (201) and `rejectResponse` (4xx service refusal). |
| `src/infrastructure/http/errors.ts` | Imports `rejectDatabaseError` (500 fallback). |
| `src/modules/products/routes.ts` | Consumes this handler as the route target for `POST /products`. |
| `src/types/index.ts` | Provides `CreateProductRequest`, `CreateProductRequestMultipart`, `Product` type imports. |

## Notes

- `translations` can arrive as a nested JSON object (`application/json`) **or** a JSON-encoded string (multipart part). `readInput`'s `jsonFields` option handles both via the same decode path used for `numbers`/`stringArrays`.
- Image URLs must not default to `''`; `ImageUrl` schema has `minLength: 1`. "No image" is expressed as `undefined` on the schema's `.optional()` field.
- Upload lifecycle is implicit: on any non-2xx path the upload middleware's close hook deletes the file. The controller only calls `claimUpload` on the success path to signal "keep it."
- `imageUrl` / `thumbnailUrl` / `pendingImageKey` are **server-decided** and passed as a third argument to `writeCreate`; they are intentionally excluded from the Zod-validated body.
