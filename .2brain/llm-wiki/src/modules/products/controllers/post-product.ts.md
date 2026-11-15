---
source: src/modules/products/controllers/post-product.ts
sha256: d3abd7f70a2621b5848169680276c79bbc32a1f89a37107cc246070daebe843d
generated_at: 2026-11-14T21:22:41.653820+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/post-product.ts

## Purpose

Admin controller for `POST /products`. Decodes scalar, array, and JSON fields from either a JSON or multipart request, validates the assembled body against a Zod schema, then delegates to `productService.create` (which persists the product and all its language translations in one write). Handles upload lifecycle and emits a `201 Created` with a `Location` header on success.

## Key elements

- **`createProduct`** (exported) — The sole handler. Reads booleans, numbers, string arrays, and JSON-encoded fields via `readInput`; merges them with `request.body`; validates via `parseBody`; reads the server-side image upload with `writeWithUploadedImage`; calls `productService.create` and `productService.presentForCaller`; responds with `createdResponse` + `answerAsResource`, or `rejectResponse` / `rejectDatabaseError` on failure.

## Relationships

- **`src/modules/products/routes.ts`** — Wires the `POST /products` route to `createProduct`.
- **`src/modules/products/services/index.ts`** — Provides `productService` (`.create`, `.presentForCaller`, `.zodProductCreateSchema`).
- **`src/infrastructure/http/request.ts`** — `readInput` decodes typed query/body fields; `callerContextOf` extracts the caller identity for the service.
- **`src/infrastructure/http/controller.ts`** — `parseBody` runs the Zod schema and short-circuits with 422 if invalid.
- **`src/infrastructure/http/uploads.ts`** — `writeWithUploadedImage` reads the server-decided image fields, performs the DB write inside its callback, and claims/deletes the upload accordingly.
- **`src/infrastructure/http/response.ts`** — `createdResponse` sends the 201 body; `rejectResponse` sends 4xx/5xx error bodies.
- **`src/infrastructure/http/preconditions.ts`** — `answerAsResource` sets the `Location` header on the success response.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` formats and sends DB-level failures.
- **`src/types/index.ts`** — Supplies `CreateProductRequest`, `CreateProductRequestMultipart`, and `Product` type signatures.
- **`src/modules/example/tests/integration/capabilities.test.ts`** — Integration test that exercises this endpoint.

## Notes

- `translations` arrives as a **JSON-encoded string** in multipart requests (multipart parts can't carry nested objects). `readInput` decodes it via `jsonFields` the same way `numbers` / `stringArrays` decode their own string-transported values — it is not parsed by the JSON body parser.
- Upload lifecycle is managed by the close hook, not by this controller: on a 422 from `parseBody` or a service-level refusal the upload is deleted automatically; on success `writeWithUploadedImage` claims it.
- The controller does **not** set the `Location` header itself in the refusal path — only the success path calls `answerAsResource`.
- The second argument to `writeWithUploadedImage` is `undefined`, indicating no additional write payload beyond what the closure provides.
