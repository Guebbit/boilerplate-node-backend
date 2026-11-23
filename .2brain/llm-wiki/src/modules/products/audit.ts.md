---
source: src/modules/products/audit.ts
source_sha256: 7e48a5fb632e12ffdbb2a7f98597d7ca8b18703e67c94bf43713fd34cce3b6db
context_sha256: e1566d7c189293e9185b8da0b0df7e791db621cdb69fde408b9368226d82b5e1
generated_at: 2026-11-22T07:07:06.863102+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/audit.ts

## Purpose
Declares the audit actions the products module emits and registers them with the app-wide audit type system via TypeScript module augmentation, rather than through a shared enum. It covers writes only: reading the catalogue is public and unauthenticated, so there is no actor to record and nothing a compliance query would ask about.

## Key elements
- `productsAuditActions` — `as const` object mapping action keys to string values:
  - `ADMIN_PRODUCT_CREATED` → `'admin.product.created'`
  - `ADMIN_PRODUCT_UPDATED` → `'admin.product.updated'`
  - `ADMIN_PRODUCT_DELETED` → `'admin.product.deleted'`
  - `ADMIN_PRODUCT_RESTORED` → `'admin.product.restored'`
- `declare module '@infrastructure/observability/audit'` — augments `AuditActionMap` with a `products` key whose type is the union of the values above.

## Relationships
- `src/modules/products/services/crud.ts` and `src/modules/products/services/remove.ts` are the write-side services. Given the action names (create/update/delete/restore), they are the likely consumers of these constants, but this file does not show how they use them.
- `src/modules/products/tests/integration/update-audit.test.ts` and `src/modules/products/tests/integration/delete-restore-audit.test.ts` are integration tests named for the update and delete/restore audit behavior. This file does not show what they assert.

## Notes
- Adding a new action means adding it to `productsAuditActions`. The `AuditActionMap` entry derives from the object's values, so the union updates automatically.
- The module doc points to `src/modules/account/audit.ts` for why augmentation is used instead of a shared enum.
- All action names use the `admin.product.*` prefix.
