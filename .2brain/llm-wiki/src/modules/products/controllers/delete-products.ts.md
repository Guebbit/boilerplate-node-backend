---
source: src/modules/products/controllers/delete-products.ts
sha256: c3466b8313964f361aa495693d965bb91b14b0be2c818e3ac64524d84e4ef1ff
generated_at: 2026-11-08T07:42:09.891729+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/delete-products.ts

## Purpose

Thin admin controller for deleting a product by ID. It delegates all delete logic to the shared `createDeleteController` factory, wiring in the product-specific service call and error-key, so the module stays consistent with other delete endpoints in the codebase.

## Key elements

- **`deleteProducts`** (exported const) — The DELETE `/products/:id` handler. Configured via `createDeleteController` with `entity: 'product'`. Accepts an optional `?hardDelete=true` query param; without it the delete is soft. On hard delete the service also emits `PRODUCT_DELETED` and removes the associated image. The `remove` callback calls `productService.removeById(id, hardDelete, callerContextOf(request))`. Not-found responses use the i18n key `products.not-found`.

## Relationships

- **`src/infrastructure/surfaces/create-delete-controller.ts`** — Provides the `createDeleteController` factory that builds the request-parsing, validation, and response-formatting scaffold around this module's `remove` callback.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, extracting the authenticated caller's identity to pass into the service for audit purposes.
- **`src/modules/products/services/index.ts`** — Source of `productService`; its `removeById` method performs the actual soft/hard delete, emits the `ADMIN_PRODUCT_DELETED` audit event, and (on hard) the `PRODUCT_DELETED` domain event and image cleanup.
- **`src/modules/products/routes.ts`** — Registers the `DELETE /products/:id` route and dispatches to `deleteProducts`.

## Notes

- This file contains no business logic; all behavior (soft vs. hard semantics, audit emission, side-effects like image removal) lives in `productService.removeById`. Changes to delete behavior should be made there, not here.
- The `callerContextOf` value is passed as the third argument to `removeById`; if the service signature changes, the wiring in this file must follow.
- The `notFoundKey` is a flat i18n string, not an object key — keep it in sync with whatever key the products error catalog actually defines.
