# src/modules/products/controllers/delete-products.ts

## Purpose

Exposes the `DELETE /products/:id` admin endpoint for removing a product. Supports soft-delete by default and a permanent (hard) delete when `?hardDelete=true` is passed. The hard path also emits a `PRODUCT_DELETED` event and removes the associated image file so no orphaned resources remain.

## Key elements

- **`deleteProducts`** (exported const) – The controller instance, built via the shared `createDeleteController` factory. Accepts:
  - `remove: (id, hardDelete) => productService.removeById(id, hardDelete)` – delegates actual deletion to the product service.
  - `auditAction: productsAuditActions.ADMIN_PRODUCT_DELETED` – audit log action recorded on success.
  - `notFoundKey: 'products.not-found'` – i18n key for the 404 response.

## Relationships

- **`src/infrastructure/http/delete-controller.ts`** – Provides the `createDeleteController` factory that wires up auth guard, path-param parsing, the optional `hardDelete` query flag, audit logging, and error handling. This file only supplies the domain-specific callbacks.
- **`src/modules/products/service.ts`** – Source of `productService.removeById`, which performs the actual soft/hard deletion (including the `PRODUCT_DELETED` event and image cleanup on the hard path).
- **`src/modules/products/audit.ts`** – Source of `productsAuditActions.ADMIN_PRODUCT_DELETED`, the audit-action identifier passed into the controller factory.
- **`src/modules/products/routes.ts`** – Registers `deleteProducts` on the router under the `DELETE /products/:id` path (this file does not import it directly; the route file imports and mounts this export).

## Notes

- The controller itself contains no business logic; all behavior (soft vs. hard, event emission, file cleanup) lives in `productService.removeById`.
- `hardDelete` is an **opt-in** query parameter (`?hardDelete=true`); omitting it results in a soft delete. This distinction is driven entirely by the infrastructure factory, not by code in this file.
- The `notFoundKey` is an i18n key, not a literal string—ensure the key exists in the translations bundle.
