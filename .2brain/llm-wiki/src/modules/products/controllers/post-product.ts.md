---
source: src/modules/products/controllers/post-product.ts
sha256: 9f90f432a2fb5ad9af18744e089fdc45b78bcfb0132cf1d791267daff45edc73
generated_at: 2026-11-08T07:42:58.188972+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/post-product.ts

## Purpose

Admin "create product" controller for `POST /products`. Decodes the incoming request body (handling both JSON and multipart encodings), validates it against the service's Zod schema, attaches the server-side image upload, delegates to `productService.create`, and returns the created product.

## Key elements

- **`createProduct`** (exported) — The sole handler. Accepts a typed `Request` whose body is `CreateProductRequest | CreateProductRequestMultipart`. Orchestrates the full create flow: input decoding → schema validation → upload handling → service call → response.

## Relationships

- **`@infrastructure/http/request`** — Uses `readInput` to decode booleans, numbers, string arrays, and JSON-encoded fields (notably `translations`) from either a JSON or multipart body. Uses `callerContextOf` to extract the authenticated caller identity passed into the service.
- **`@infrastructure/http/controller`** — Uses `parseBody` to run the request through `productService.zodProductCreateSchema`; on failure it sends a 422 and the function returns early.
- **`@infrastructure/http/uploads`** — Calls `writeWithUploadedImage`, which reads the server-decided image fields off the upload, invokes the provided write callback (which calls `productService.create`), and claims the upload on success.
- **`@infrastructure/http/response`** — Emits `createdResponse` (201 + product + Location header) on success and `rejectResponse` on business-level refusal.
- **`@infrastructure/http/errors`** — Catches thrown errors in the `.catch` branch and delegates to `rejectDatabaseError` for a structured 5xx.
- **`src/modules/products/services/index.ts`** — Source of `productService`, which provides `zodProductCreateSchema`, `create`, and `toProduct`.
- **`src/modules/products/routes.ts`** — Registers `createProduct` as the handler for the `POST /products` route.
- **`src/types/index.ts`** — Provides `CreateProductRequest`, `CreateProductRequestMultipart`, and `Product` used for type annotations.
- **`src/modules/example/tests/integration/capabilities.test.ts`** — Integration test that exercises this endpoint.

## Notes

- **Multipart JSON quirk:** When the request is `multipart/form-data`, `translations` arrives as a JSON-encoded *string* (multipart parts cannot carry nested objects). `readInput`'s `jsonFields` option handles the decode, mirroring how `numbers` and `stringArrays` work.
- **Upload lifecycle:** Image fields are server-decided by the upload middleware and never appear in the Zod-validated body. On success, `writeWithUploadedImage` claims the upload (preventing cleanup). On any 4xx/5xx path, the upload middleware's `close` hook deletes the file — the controller does not clean up manually.
- **Early-return pattern:** If `parseBody` fails validation it already sent a 422; the handler simply returns without further processing.
