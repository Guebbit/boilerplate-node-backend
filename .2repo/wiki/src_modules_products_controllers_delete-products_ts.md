# src/modules/products/controllers/delete-products.ts

## Purpose

Thin admin controller for deleting a product by path ID. It delegates all real work to the shared `createDeleteController` factory and the product service, exposing only the wiring (entity name, removal function, audit action, and i18n key).

## Key elements

- **`deleteProducts`** (exported) — The controller instance returned by `createDeleteController`. Handles `DELETE /products/:id`. A `?hardDelete=true` query parameter triggers permanent removal; otherwise the product is soft-deleted. The hard path also fires a `PRODUCT_DELETED` announcement and deletes the associated image file.
- **Configuration object** passed to the factory:
  - `entity: 'product'`
  - `remove` — calls `productService.removeById(id, hardDelete)`
  - `auditAction: productsAuditActions.ADMIN_PRODUCT_DELETED`
  - `notFoundKey: 'products.not-found'` — i18n key for the 404 message

## Relationships

- **`src/infrastructure/surfaces/create-delete-controller.ts`** — Supplies the `createDeleteController` factory that builds the HTTP handler (parsing `:id`, reading `?hardDelete`, returning status codes, writing the audit log).
- **`src/modules/products/service.ts`** — Provides `productService.removeById`, the actual data-layer deletion (soft or hard).
- **`src/modules/products/audit.ts`** — Provides `productsAuditActions.ADMIN_PRODUCT_DELETED`, the enum value recorded in the audit trail.
- **`src/modules/products/routes.ts`** — Registers `deleteProducts` on the product routes (admin scope, `DELETE /products/:id`).

## Notes

- This file contains no logic of its own; behavior (validation, response shape, side-effects like image cleanup and the `PRODUCT_DELETED` event) lives inside `createDeleteController` and `productService.removeById`. Read those for actual semantics.
- The `notFoundKey` is a localization key, not a literal string — the rendered message depends on the active locale.
- The file's own JSDoc is the canonical description of the endpoint; the module-level comment explicitly defers to the factory's JSDoc for full behavior.
