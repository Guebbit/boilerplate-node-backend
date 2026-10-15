---
source: src/modules/products/controllers/delete-products.ts
sha256: c3466b8313964f361aa495693d965bb91b14b0be2c818e3ac64524d84e4ef1ff
generated_at: 2026-10-15T11:40:06.442606+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/delete-products.ts

## Purpose

Admin endpoint controller for deleting a product by ID. It is a thin wiring layer that plugs `productService.removeById` into the shared `createDeleteController` factory, so the actual HTTP handling (route parsing, `?hardDelete` flag, 404 response) is inherited rather than re-implemented.

## Key elements

- **`deleteProducts`** (named export) — the controller returned by `createDeleteController`. Handles `DELETE /products/:id`.
  - **`remove` callback** — calls `productService.removeById(id, hardDelete, callerContextOf(request))`.
  - **`entity`** — set to `'product'` (used by the factory for error/audit framing).
  - **`notFoundKey`** — `'products.not-found'`, the i18n key for the 404 body.

## Relationships

- **`@infrastructure/surfaces/create-delete-controller`** — provides the `createDeleteController` factory that supplies the HTTP verb handling, query-param parsing for `hardDelete`, and the 404 short-circuit. This file only supplies the entity name and the `remove` callback.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the authenticated caller's context, which is forwarded into the service call.
- **`../services/index`** — `productService.removeById` performs the actual deletion (soft or hard), emits the `ADMIN_PRODUCT_DELETED` audit event, and (on hard delete) announces `PRODUCT_DELETED` and removes the product image.
- **`src/modules/products/routes.ts`** — registers `deleteProducts` on the `DELETE /products/:id` route (admin-protected).

## Notes

- Default deletion is **soft**; pass `?hardDelete=true` to delete permanently.
- Hard delete has two side effects beyond row removal: it fires a `PRODUCT_DELETED` domain event (so wishlists etc. can react) and deletes the product's image file from disk.
- The `ADMIN_PRODUCT_DELETED` audit emission lives inside `productService.removeById`, **not** in this controller — so auditing is guaranteed even if the controller layer changes.
- The file exports a controller, not a raw handler; it has no direct dependency on Express/Fastify — the framework binding happens inside `createDeleteController`.
