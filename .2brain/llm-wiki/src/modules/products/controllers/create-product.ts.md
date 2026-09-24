---
source: src/modules/products/controllers/create-product.ts
sha256: 6b4b6cc799c59a29c968014e864876bf636e6fa3a62dcbd8ee4c086c226f45f0
generated_at: 2026-09-23T19:25:33.632048+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/create-product.ts

## Purpose

Admin-facing HTTP handler for `POST /products`. It decodes the request body (JSON or multipart) and the image upload into a flat, typed payload, then delegates validation and persistence to `productService.writeCreate`, which writes the product and all its language translations in a single operation.

## Key elements

- **`createProduct`** (exported) — Express handler. Decodes fields via `readInput` (booleans, numbers, string-arrays, JSON fields), reads the uploaded image via `readUploadedImage`, calls `productService.writeCreate`, and responds with `201` + a `Product` on success or an appropriate error status on failure.
- **`readInput` configuration** — declares which body keys are booleans (`active`), numbers (`price`, `onHand`, `weight`), string arrays (`categories`, `tags`), and JSON fields (`translations`), producing correctly-typed values regardless of transport format.
- **`deleteUpload`** — a cleanup callback returned by `readUploadedImage`; invoked on every failure path to remove the now-orphaned uploaded file.

## Relationships

- **`src/modules/products/service.ts`** — imports and calls `productService.writeCreate` (persistence) and `productService.toProduct` (DTO mapping for the 201 response).
- **`src/infrastructure/http/request.ts`** — uses `readInput` for typed body decoding and `callerContextOf` to extract the authenticated caller identity passed to the service.
- **`src/infrastructure/http/uploads.ts`** — uses `readUploadedImage` to extract `imageUrl`, `thumbnailUrl`, `pendingImageKey`, and the `deleteUpload` cleanup function from the request.
- **`src/infrastructure/http/response.ts`** — uses `successResponse` (201) and `rejectResponse` (business-logic failure) for HTTP replies.
- **`src/infrastructure/http/errors.ts`** — uses `rejectDatabaseError` as the catch-all for unexpected/DB exceptions.
- **`src/types/index.ts`** — imports `CreateProductRequest`, `CreateProductRequestMultipart`, and `Product` for typing the request body and the response payload.
- **`src/modules/products/routes.ts`** — registers `createProduct` as the handler for the `POST /products` admin route.

## Notes

- **Multipart `translations`:** In a multipart request, `translations` arrives as a JSON-encoded _string_ (multipart parts cannot carry nested objects). `readInput` decodes it via the `jsonFields` mechanism, just as it decodes `numbers` and `stringArrays`. Callers must `JSON.stringify` the translations object before putting it in the multipart part.
- **`imageUrl` default:** When no image is uploaded, `imageUrl` is set to `''` (empty string), not `null`/`undefined`. This matches the `zodProductCreateSchema` expectation.
- **Cleanup on every failure path:** `deleteUpload()` is called in both the business-logic rejection branch _and_ the unexpected-error `.catch`, each with a `.catch(() => undefined)` so a failed cleanup doesn't mask the original error.
- **Body spread ordering:** `{ ...request.body, price, active, … }` places the decoded (typed) values _after_ the raw body spread, so the decoded values always win over any same-named raw fields.
