---
source: src/modules/products/controllers/create-product.ts
sha256: b46ad0d783ec47b73d925f64e34373420a9ae7e6bfb5c78f4874cbe0d3b3cfa7
generated_at: 2026-10-29T05:24:49.936740+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/create-product.ts

## Purpose

Admin-facing HTTP handler for `POST /products`. It decodes the multipart or JSON request body (including a base64 image upload and per-language translations), validates the payload against the service's Zod schema, persists the product via `productService.create`, and returns a `201` with the new product or an appropriate error.

## Key elements

- **`createProduct(request, response)`** – the sole export. Orchestrates the full create flow:
  1. Extracts typed fields (booleans, numbers, string arrays, JSON `translations`) from the request via `readInput`.
  2. Validates the merged body against `productService.zodProductCreateSchema` using `parseBody` (answers 422 on failure).
  3. Reads the server-side image upload through `writeWithUploadedImage` and passes the decoded image to the service.
  4. Calls `productService.create(body, callerContextOf(request), image)`.
  5. Maps the result to `createdResponse` (201 + `Location` header) or `rejectResponse` (service-level 4xx).
  6. Catches and routes unexpected database errors through `rejectDatabaseError`.

## Relationships

- **`src/modules/products/services/index.ts`** – provides `productService`, the domain logic (Zod schema, `create`, `toProduct`) this controller delegates to.
- **`src/modules/products/routes.ts`** – registers `createProduct` as the handler for `POST /products`.
- **`src/infrastructure/http/request.ts`** – supplies `readInput` (typed field extraction) and `callerContextOf` (auth/caller context).
- **`src/infrastructure/http/controller.ts`** – supplies `parseBody`, which runs the Zod schema and short-circuits with 422.
- **`src/infrastructure/http/response.ts`** – supplies `createdResponse` and `rejectResponse` for shaping HTTP replies.
- **`src/infrastructure/http/errors.ts`** – supplies `rejectDatabaseError` for unexpected DB failures.
- **`src/infrastructure/http/uploads.ts`** – supplies `writeWithUploadedImage`, which reads the server-decided image fields, writes the product, and claims the upload on success.
- **`src/types/index.ts`** – provides the `CreateProductRequest`, `CreateProductRequestMultipart`, and `Product` types used in the handler signature.
- **`src/modules/example/tests/integration/capabilities.test.ts`** – integration test that exercises this endpoint.

## Notes

- `translations` is transported as a JSON-encoded **string** in multipart requests (multipart parts cannot carry nested objects). `readInput` decodes it via the `jsonFields` option, mirroring how `numbers` and `stringArrays` handle their string-transported values.
- The image upload is never part of the Zod-validated body; `writeWithUploadedImage` reads server-decided image fields separately and claims the upload only on a successful write. On a 4xx/5xx the upload middleware's close hook deletes it.
- `parseBody` returns `undefined` after sending a 422; the handler must early-return in that case (the `if (!body) return` guard).
- The handler is a plain Express `(req, res)` function, not a class-based controller, consistent with the module's controller style.
