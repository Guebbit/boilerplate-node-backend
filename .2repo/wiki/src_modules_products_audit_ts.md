# src/modules/products/audit.ts

## Purpose

Defines the set of audit action strings that the products module emits and registers them into the app-wide `AuditActionMap` via TypeScript module augmentation. Only write operations (create, update, delete) are represented because catalogue reads are public and unauthenticated, so there is no actor to record.

## Key elements

- **`productsAuditActions`** — A `as const` object exporting three string-literal values: `ADMIN_PRODUCT_CREATED`, `ADMIN_PRODUCT_UPDATED`, `ADMIN_PRODUCT_DELETED`. This is the single source of truth for the products module's audit vocabulary.
- **`declare module '@infrastructure/observability/audit'`** — Augments the `AuditActionMap` interface to add a `products` key typed as the union of the three action values. This makes the actions part of the global audit union without requiring a shared enum.

## Relationships

- **`src/modules/products/service.ts`** — Consumer of `productsAuditActions`; emits `ADMIN_PRODUCT_CREATED` and `ADMIN_PRODUCT_UPDATED` when persisting changes.
- **`src/modules/products/controllers/delete-products.ts`** — Consumer of `productsAuditActions`; emits `ADMIN_PRODUCT_DELETED` when a product is removed.
- **`src/modules/products/tests/unit/audit.test.ts`** — Unit tests that verify the exported action strings and their shape.

## Notes

- The module uses **augmentation** (a `declare module` block) rather than importing a shared enum. The JSDoc points to `modules/account/audit.ts` as the precedent and rationale for this pattern.
- The values are write-only by design. If a future read path gains authentication, a new action string would need to be added here and the `AuditActionMap` union updated in the same file.
