---
source: src/modules/products/controllers/get-product-admin.ts
sha256: a02037851389b8110b00c25451c8a0540fd40406ec2b52d5ee8cad142b01bda2
generated_at: 2026-09-23T19:25:56.217580+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-product-admin.ts

## Purpose

Handler for `GET /products/:id/admin`. Returns a product with **every language row it has**, shaped for the admin editor's multi-language form. It exists as a standalone controller (rather than a product of the shared `createItemController` factory) because the factory's fixed `get<Entity>Item` naming does not fit this operation's route, even though the error-handling logic is identical to `get-product-item.ts`.

## Key elements

- **`getProductAdmin(request, response)`** – The sole export. Calls `productService.getAdmin(id)`, responds with a `ProductAdmin` payload on success, or a 404 with the `products.not-found` i18n message when the product is missing or the id is malformed.
- **`catchAsNotFound(response, 'getProductAdmin', 'products.not-found')`** – Catches Mongoose `CastError` (malformed ObjectId) and converts it to the same 404 a genuine "not found" would produce, so external callers cannot distinguish the two.

## Relationships

- **`src/modules/products/service.ts`** – Calls `productService.getAdmin(id)`; the service performs the actual multi-language query.
- **`src/infrastructure/http/response.ts`** – Provides `successResponse` (200 wrapper) and `rejectResponse` (404 with error array).
- **`src/infrastructure/http/controller.ts`** – Provides `catchAsNotFound`, the shared helper that turns a `CastError` into a 404 JSON response.
- **`src/infrastructure/i18n/index.ts`** – Exports the `t()` translation function used for the `products.not-found` message.
- **`src/types/index.ts`** – Supplies the `ProductAdmin` shape that types the success payload.
- **`src/modules/products/routes.ts`** – Registers `getProductAdmin` on the `GET /products/:id/admin` route.

## Notes

- The file deliberately **does not** use the `createItemController` factory (used by `get-product-item.ts`) despite having identical error semantics, because the factory hard-codes a `get<Product>Item` handler name that would be misleading here.
- `CastError` → 404 is an intentional choice: a malformed id and an unknown id are indistinguishable to the caller, and the route defines no 422 fallback. Other recognized database errors (e.g. `BSONError`) still surface as 422 via `rejectDatabaseError` inside the service layer.
- The i18n key `products.not-found` is used both for the explicit "not found" branch and for the `CatchError` branch, so both paths produce the same client-visible message.
