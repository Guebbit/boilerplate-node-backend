---
source: src/modules/products/audit.ts
sha256: 7d094371857854a78a8f8d62f0bb3ece42b8f46b9c7e74ee44422b07edec6799
generated_at: 2026-09-27T15:30:16.226252+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/audit.ts

## Purpose

Declares the audit-action vocabulary for the products module and registers it into the app-wide `AuditActionMap` via TypeScript declaration merging. Only write operations (create, update, delete, restore) are audited; catalogue reads are public and unauthenticated, so there is no actor to record.

## Key elements

- **`productsAuditActions`** (const, exported) — Four string literal actions: `admin.product.created`, `admin.product.updated`, `admin.product.deleted`, `admin.product.restored`. Serves as the single source of truth for products audit event names.
- **`declare module '@infrastructure/observability/audit'`** — Augments the `AuditActionMap` interface with a `products` key typed to the values of `productsAuditActions`, making the actions available app-wide through the shared audit infrastructure.

## Relationships

- **`src/modules/products/controllers/delete-products.ts`** — Emits `ADMIN_PRODUCT_DELETED` when a product is soft-deleted.
- **`src/modules/products/controllers/restore-products.ts`** — Emits `ADMIN_PRODUCT_RESTORED` when a soft-deleted product is restored.
- **`src/modules/products/service.ts`** — Emits `ADMIN_PRODUCT_CREATED` and `ADMIN_PRODUCT_UPDATED` during write operations.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — Verifies that the declaration-merging augmentation actually lands in `AuditActionMap` and that the four product actions are present.

## Notes

- Actions are declared via **module augmentation**, not a shared enum. The rationale (referenced in the doc comment) is documented in `modules/account/audit.ts`; follow the same pattern when adding a new module's actions.
- The `as const` on `productsAuditActions` is load-bearing: it gives the augmented interface a literal-string union rather than a plain `string`, enabling exhaustive checks downstream.
- No read actions exist by design. If a future change introduces an authenticated read endpoint, an action should be added here *and* the `AuditActionMap` augmentation updated in the same commit.
