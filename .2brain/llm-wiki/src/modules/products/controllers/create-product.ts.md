---
source: src/modules/products/controllers/create-product.ts
sha256: b1ec3414d4954af3fa956ca53e9efa92653e334780718c2d3987204d3e065313
generated_at: 2026-09-27T15:30:53.445758+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/create-product.ts

## Purpose

Admin "create product" HTTP controller for the catalogue. Decodes the typed request body (JSON or multipart) and the image upload, then delegates to `productService.writeCreate` so that the product and all its language translations are validated and persisted in a single atomic operation.

## Key elements

- **`createProduct`** (exported) — The sole handler for `POST /products`.
  - Calls `readInput` to decode booleans (`active`, `requiresShipping`), numbers (`price`, `onHand`, `weight`), string arrays (`categories`, `tags`), and a JSON field (`translations`) from the request body.
  - Calls `readUploadedImage` to extract `imageUrl`, `thumbnailUrl`, `pendingImageKey`, and a `deleteUpload` cleanup callback.
  - Delegates to `productService.writeCreate` with the decoded payload, caller context, and image metadata.
  - On domain failure: invokes `deleteUpload()` (errors swallowed), then `rejectResponse`.
  - On success: responds `201` with `productService.toProduct(result.data)`.
  - On unexpected/DB error: invokes `deleteUpload()` (errors swallowed), then `rejectDatabaseError`.

## Relationships

- **`src/modules/products/service.ts`** — All business logic (validation, persistence, product mapping) is delegated here via `productService.writeCreate` and `productService.toProduct`.
- **`src/modules/products/routes.ts`** — Wires the `POST /products` route to this controller function.
- **`src/infrastructure/http/request.ts`** — Provides `readInput` (typed field decoding) and `callerContextOf` (caller identity for the service layer).
- **`src/infrastructure/http/uploads.ts`** — Provides `readUploadedImage` for image extraction and the `deleteUpload` cleanup callback.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` / `rejectResponse` for building HTTP replies.
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError` for unexpected persistence failures.
- **`src/types/index.ts`** — Source of `CreateProductRequest`, `CreateProductRequestMultipart`, and `Product` types used in signatures and the success payload.

## Notes

- **Multipart `translations`:** In a `multipart/form-data` request, `translations` arrives as a JSON-encoded *string* (multipart parts cannot carry nested objects). It is therefore listed under `jsonFields` in `readInput` so it is `JSON.parse`-d before reaching the service.
- **Image "absent" sentinel:** When no image is uploaded, `imageUrl` is left `undefined` (not `''`) so that `zodProductCreateSchema`'s `.optional()` field treats it as "no image" rather than a validation error (`ImageUrl` enforces `minLength: 1`).
- **Upload cleanup:** On both the failure and the catch path, `deleteUpload()` is called with its rejection swallowed (`.catch(() => undefined)`) to remove the server-side file before the response is sent.
- **Status code:** Successful creation returns **201**, not 200.
