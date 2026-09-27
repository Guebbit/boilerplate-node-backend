---
source: src/modules/products/controllers/restore-products.ts
sha256: c0991dd153affd5dfc2f6654a45132ac6cfec045dc38a1be0554d19efa7f4abf
generated_at: 2026-09-27T15:31:21.992971+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/restore-products.ts

## Purpose

Thin wiring module that exposes the admin **restore** endpoint (`POST /products/:id/restore`) for the catalogue. It delegates all HTTP-handling logic to the shared `createRestoreController` factory and simply supplies product-specific collaborators (service, audit action, i18n key). The file exists to keep the module boundary clean so `routes.ts` can import a single named export without re-implementing restore semantics.

## Key elements

- **`restoreProducts`** (export) – The controller handler produced by `createRestoreController`. Handles the full request lifecycle (lookup, 409 guard, service call, audit, serialization, response) per the factory's contract.
- **`entity: 'product'`** – Identifies the resource in audit logs and error messages.
- **`restore: (id) => productService.restoreById(id)`** – Performs the actual soft-delete undo.
- **`present: (product) => productService.toProduct(product)`** – Serializes the restored row into the public DTO.
- **`auditAction: productsAuditActions.ADMIN_PRODUCT_RESTORED`** – Audit-trail constant recorded on success.
- **`notFoundKey: 'products.not-found'`** – i18n key used for the 404 response body.

## Relationships

- **`create-restore-controller.ts`** – Supplies the `createRestoreController` factory that this file calls once at module load to obtain the handler.
- **`service.ts`** – Provides `productService.restoreById` (state change) and `productService.toProduct` (presentation mapping) injected into the factory config.
- **`audit.ts`** – Exports `productsAuditActions.ADMIN_PRODUCT_RESTORED`, the audit constant recorded when a restore succeeds.
- **`routes.ts`** – Consumes the `restoreProducts` export to register the `POST /products/:id/restore` route in the admin router.

## Notes

- The file contains **zero business logic**; any behavior change (validation, 409 semantics, response shape) must be made in `create-restore-controller.ts` or the service layer.
- A product that is **not** in a deleted state yields a **409**, not a 404 (documented in the JSDoc; enforced by the factory).
- `notFoundKey` is an i18n key, not a literal string—localisation lives outside this file.
