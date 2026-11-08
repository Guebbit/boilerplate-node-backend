---
source: src/modules/cart/audit.ts
sha256: 9dfafe7dc4a5020344df4d54738e9781b1236a486a46a09566e4c49ccc7b46ec
generated_at: 2026-11-08T05:10:52.663792+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/audit.ts

## Purpose

Declares the cart module's audit action names and registers them into the app-wide `AuditActionMap` via TypeScript module augmentation. This file exists so that any audit event the cart emits has a stable, typed identifier that the observability layer can consume without circular imports.

## Key elements

- **`cartAuditActions`** (exported `const`) — the two action strings this module fires:
  - `USER_CART_ITEM_REMOVED` (`'user.cart.item_removed'`) — a line-item was removed from a customer's cart.
  - `USER_CART_REORDERED` (`'user.cart.reordered'`) — a full order's line-items re-entered the cart at once.
- **Module augmentation of `@infrastructure/observability/audit`** — adds a `cart` key to `AuditActionMap`, constraining it to the values in `cartAuditActions`. This is the pattern (not a shared enum) used project-wide; see `modules/account/audit.ts` for the rationale.

## Relationships

- **`src/modules/cart/services/items.ts`** — the service that performs cart-item removal; the expected caller of `USER_CART_ITEM_REMOVED`.
- **`src/modules/cart/services/reorder.ts`** — the service that re-orders a prior order back into the cart; the expected caller of `USER_CART_REORDERED`.

## Notes

- All actions use the `user.` prefix (not `admin.`) because both represent customer-initiated cart changes; this is intentional and distinguishes them from admin-side cart mutations elsewhere in the codebase.
- The augmentation pattern means these names are only visible to TypeScript after this file is included in the compilation; importing the audit port alone will not expose the `cart` key unless this module (or a barrel that re-exports it) is in scope.
