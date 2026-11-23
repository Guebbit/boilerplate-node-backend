---
source: src/modules/products/controllers/post-product.ts
source_sha256: a97f86b1428429633636648b92e72406afa3c7587d3ae7a75eef4f9fd0519f20
context_sha256: 25eb65f52bff524e6a1b841bf290d3a84d1f9953fc1f9f13bfb5db2c8bb74520
generated_at: 2026-11-22T07:08:16.109418+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/controllers/post-product.ts

## Purpose
Express controller for the admin `POST /products` endpoint. It decodes the request input (JSON or multipart, including an optional image upload), validates it, passes it to `productService.create`, and replies with `201 Created` and the presented product. The service writes the product together with all of its translations in a single operation.

## Key elements
- **`createProduct(request, response)`** is the only export. It is an Express handler typed for `CreateProductRequest | CreateProductRequestMultipart` bodies.
  - **Input decoding:** `readInput` with `surface: 'create'` coerces the fields:
    - booleans: `active`, `purchasable`, `allowBackorder`, `requiresShipping`, `noWithdrawal`
    - number: `weight`
    - string arrays: `categories`, `tags`
    - JSON field: `translations`
  - **Validation:** `parseBody` checks the merged body (raw `request.body` plus the decoded fields) against `productService.zodProductCreateSchema`. On failure it has already sent a 422, so the handler returns.
  - **Write:** `writeWithUploadedImage(request, undefined, image => productService.create(body, callerContextOf(request), image))` runs the create.
  - **Failure result:** if `result.success` is false, it calls `rejectResponse(response, result.status, result.errors)`.
  - **Success result:** it calls `productService.presentForCaller(result.data, request.caller)`. It then calls `answerAsResource` with `/products/:id` and sends `createdResponse<Product>` with the same location.
  - **Unexpected errors:** a thrown error goes to `rejectDatabaseError(response, 'createProduct', error)`.

## Relationships
- **`../services`**: provides `productService` (`zodProductCreateSchema`, `create`, `presentForCaller`).
- **`@infrastructure/http/request`**: provides `readInput` and `callerContextOf`.
- **`@infrastructure/http/controller`**: provides `parseBody`.
- **`@infrastructure/http/uploads`**: provides `writeWithUploadedImage`, which supplies the server-decided image fields and claims the upload on success.
- **`@infrastructure/http/response`**: provides `rejectResponse` and `createdResponse`.
- **`@infrastructure/http/preconditions`**: provides `answerAsResource`, which sets the new product's tag and resource location.
- **`@infrastructure/http/errors`**: provides `rejectDatabaseError`.
- **`@types`**: provides `CreateProductRequest`, `CreateProductRequestMultipart` and `Product`.
- **`src/modules/products/routes.ts`**: the route that mounts this handler.

## Notes
- On a multipart body, `translations` arrives as a JSON-encoded string, because multipart parts carry only strings. `jsonFields` decodes it.
- The image fields come from the upload helper, not the body. They never pass through the validated schema.
- The upload is not claimed when validation (422) or the write is refused (4xx/5xx). The upload middleware's close hook deletes it once the response has gone out.
- The handler returns the promise chain, but returns `undefined` when `parseBody` has already answered.
