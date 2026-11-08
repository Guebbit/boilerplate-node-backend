---
source: src/modules/products/audit.ts
sha256: 7d094371857854a78a8f8d62f0bb3ece42b8f46b9c7e74ee44422b07edec6799
generated_at: 2026-11-08T07:41:30.149791+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/audit.ts

## Purpose

Defines the audit-action vocabulary for the products module and registers it into the application-wide `AuditActionMap` via TypeScript module augmentation. Only write actions (create, update, delete, restore) are tracked; reads are intentionally excluded because they are public and unauthenticated, leaving no actor to record.

## Key elements

- **`productsAuditActions`** — `as const` object holding the four audit action strings: `ADMIN_PRODUCT_CREATED`, `ADMIN_PRODUCT_UPDATED`, `ADMIN_PRODUCT_DELETED`, `ADMIN_PRODUCT_RESTORED`.
- **`declare module '@infrastructure/observability/audit'`** — augments the shared `AuditActionMap` interface so the global audit infrastructure is aware of the `products` namespace and its valid actions.

## Relationships

- **`services/crud.ts`** — consumer: emits `ADMIN_PRODUCT_CREATED` / `ADMIN_PRODUCT_UPDATED` when writing product records.
- **`services/remove.ts`** — consumer: emits `ADMIN_PRODUCT_DELETED` / `ADMIN_PRODUCT_RESTORED` when soft-deleting or restoring a product.
- **`tests/integration/update-audit.test.ts`** — verifies the `ADMIN_PRODUCT_UPDATED` action is recorded with correct payload.
- **`tests/integration/delete-restore-audit.test.ts`** — verifies the delete and restore audit actions are recorded correctly.

## Notes

- Actions are registered by *module augmentation* rather than a shared enum. The file's header comment points to `modules/account/audit.ts` for the rationale (decoupling so each module owns its vocabulary without a circular shared-enum import).
- The `as const` on `productsAuditActions` means the key set is finite and usable in `typeof` positions (as the augmentation does), but it is **not** a discriminated union or enum—callers import the object and index by key.
