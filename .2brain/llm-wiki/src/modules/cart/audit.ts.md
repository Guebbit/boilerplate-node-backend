---
source: src/modules/cart/audit.ts
source_sha256: efbf37a9b57d2fa0d2aa1a3706ea33c552a83ccd933dbc99fa9ac98ab9bc7c9a
context_sha256: 2847f5da9479a345c4c3780206869f9095932574f9ad5ec83b3fd0eb16cfa2ff
generated_at: 2026-11-22T04:29:47.055352+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/audit.ts

## Purpose
Declares the audit action names the cart module emits and registers them into the app-wide audit action union. Actions are added by type augmentation rather than a shared enum (the rationale is documented in `src/modules/account/audit.ts`). It exists so cart events, such as a line vanishing from a cart, leave a record that can settle support questions.

## Key elements
- `cartAuditActions`: a `const` object keyed by intent, with two actions:
  - `USER_CART_ITEM_REMOVED` = `'user.cart.item_removed'`. A customer removes a line from their own cart. It uses the `user.` prefix, not `admin.`, because the customer performs it. It is audited to settle whether a customer added an item that later disappeared.
  - `USER_CART_REORDERED` = `'user.cart.reordered'`. A whole order's lines re-enter the cart at once. It answers "why is my cart suddenly full", and the metadata names the order responsible.
- `declare module '@infrastructure/observability/audit'`: augments `AuditActionMap` with a `cart` entry. Its type is the union of the values in `cartAuditActions`.

## Relationships
- `src/modules/cart/services/items.ts` and `src/modules/cart/services/reorder.ts` are the neighbors. By intent they line up with the two actions: item removal and reorder. The file itself contains no imports or calls, so the exact emit sites are not visible here.
- The augmentation targets the audit port in `@infrastructure/observability/audit`.

## Notes
- `as const` keeps the action values as literal types, which the `AuditActionMap` union depends on.
- A new cart action must be added to `cartAuditActions`. The augmentation picks it up automatically through `keyof typeof`.
