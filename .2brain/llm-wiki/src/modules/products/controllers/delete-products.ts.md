---
source: src/modules/products/controllers/delete-products.ts
sha256: 0d7771d5698923c7a3326713c8f61eb7dcee125be031427ca64cb41dae92c300
generated_at: 2026-09-23T19:25:40.175301+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/delete-products.ts

## Purpose

Admin-facing delete endpoint for the product catalogue. It is a thin, one-line wiring of the shared `createDeleteController` factory to the product domain, delegating all delete logic to the service layer so the controller itself contains no business logic.

## Key elements

- **`deleteProducts`** (export) — The HTTP handler for `DELETE /products/:id`. Configured via `createDeleteController` with:
    - `entity: 'product'`
    - `remove: (id, hardDelete) => productService.removeById(id, hardDelete)` — delegates the actual delete to the product service.
    - `auditAction: productsAuditActions.ADMIN_PRODUCT_DELETED`
    - `notFoundKey: 'products.not-found'`
    - Query param `?hardDelete=true` triggers a permanent delete (plus image cleanup and a `PRODUCT_DELETED` announcement); omitting it performs a soft delete.

## Relationships

- **`src/infrastructure/surfaces/create-delete-controller.ts`** — Provides the `createDeleteController` factory that this file calls. All request parsing, error handling, audit emission, and response shaping live in that factory; this file only supplies the domain-specific options.
- **`src/modules/products/service.ts`** — `productService.removeById(id, hardDelete)` is the actual persistence operation. The controller has no direct database access.
- **`src/modules/products/audit.ts`** — Supplies `productsAuditActions.ADMIN_PRODUCT_DELETED`, the audit-log action key recorded on every successful delete.
- **`src/modules/products/routes.ts`** — Expected to import `deleteProducts` and mount it on the `DELETE /products/:id` route.

## Notes

- The controller file intentionally contains no logic beyond the factory call. Any behavioral change (e.g., adding validation, changing the not-found response) belongs in `createDeleteController` or `productService`, not here.
- Hard delete has side effects beyond the DB row: it emits a `PRODUCT_DELETED` event and removes the product's image from disk. Soft delete does neither.
