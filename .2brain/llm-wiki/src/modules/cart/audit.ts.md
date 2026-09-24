---
source: src/modules/cart/audit.ts
sha256: 9dfafe7dc4a5020344df4d54738e9781b1236a486a46a09566e4c49ccc7b46ec
generated_at: 2026-09-23T18:28:48.668122+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/audit.ts

## Purpose

Declares the audit action names the cart module emits and registers them into the app-wide `AuditActionMap` via TypeScript module augmentation. The actions exist to create an auditable trail of customer-initiated cart mutations (item removal, bulk reorder) that serve as the authoritative record for support disputes about cart contents.

## Key elements

- **`cartAuditActions`** (exported const) — Maps intent keys to the string action names the cart module fires:
  - `USER_CART_ITEM_REMOVED` → `'user.cart.item_removed'`
  - `USER_CART_REORDERED` → `'user.cart.reordered'`
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — Adds a `cart` property to `AuditActionMap` typed as the union of `cartAuditActions` values, so any audit call site gets autocomplete/type-safety for cart actions.

## Relationships

- **`src/modules/cart/services/items.ts`** — Expected emitter of `USER_CART_ITEM_REMOVED` when a line item is removed from a customer's cart.
- **`src/modules/cart/services/reorder.ts`** — Expected emitter of `USER_CART_REORDERED` when a prior order's lines are bulk-inserted back into the cart.
- **`src/modules/cart/tests/unit/audit.test.ts`** — Unit tests covering the action-name constants and the augmentation.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — Cross-cutting test that asserts every module's actions (including cart's) are present in the global `AuditActionMap`.

## Notes

- Actions are prefixed `user.` (not `admin.`) because a *customer* performs these actions on their *own* cart; the prefix signals the actor in audit logs.
- The augmentation pattern (rather than a shared enum) is intentional and mirrored across modules — see `modules/account/audit.ts` for the same convention. Adding a new cart action requires both adding it to `cartAuditActions` and, implicitly, the augmentation picks it up via the `typeof` union.
- Both actions are `as const`, so the augmentation's type is the literal union of the two strings, not `string`.
