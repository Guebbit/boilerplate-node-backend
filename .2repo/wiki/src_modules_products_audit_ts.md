# src/modules/products/audit.ts

## Purpose

Declares the set of audit actions that the products module emits for admin write operations (create, update, delete). It uses a TypeScript module augmentation to register those action keys into the shared `AuditActionMap` interface, providing compile-time safety without a central enum. Read operations are intentionally excluded because catalogue reads are public and unauthenticated, so there is no actor to record.

## Key elements

- **`productsAuditActions`** – A `const` object mapping three logical names to their wire strings:
  - `ADMIN_PRODUCT_CREATED` → `'admin.product.created'`
  - `ADMIN_PRODUCT_UPDATED` → `'admin.product.updated'`
  - `ADMIN_PRODUCT_DELETED` → `'admin.product.deleted'`
- **`declare module '@infrastructure/observability/audit'`** – Augments the `AuditActionMap` interface with a `products` key typed as the union of the action string literals. This is the mechanism (rather than a shared enum) that lets the observability layer reference product-specific actions.

## Relationships

- **`src/modules/products/service.ts`** – Consumer side: the service layer emits these action keys when an admin creates or updates a product via the audit logging infrastructure.
- **`src/modules/products/controllers/delete-products.ts`** – Consumer side: emits `ADMIN_PRODUCT_DELETED` when an admin deletes a product.
- **`src/modules/products/tests/unit/audit.test.ts`** – Verifies the action key values and the module-augmentation typing for this file.

## Notes

- The augmentation pattern (vs. a shared enum) is an intentional convention; the rationale is documented in the file header and mirrored in `modules/account/audit.ts`.
- Only *write* actions are listed here. If a future requirement adds authenticated read auditing, a new key must be added here *and* the corresponding consumer must be updated.
- The action strings follow the `admin.<resource>.<verb>` naming convention; do not rename them casually as they are the contract with the observability/audit pipeline.
