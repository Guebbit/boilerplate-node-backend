# src/modules/cart/audit.ts

## Purpose
Declares the cart module's audit action names and registers them into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so that cart-specific audit events have a single, typed source of truth without polluting a shared enum.

## Key elements
- **`cartAuditActions`** – `as const` object exposing two action strings:
  - `USER_CART_ITEM_REMOVED` (`user.cart.item_removed`) – fired when a single line is removed from a customer's cart.
  - `USER_CART_REORDERED` (`user.cart.reordered`) – fired when a whole order's lines re-enter the cart at once.
- **`declare module '@infrastructure/observability/audit'`** – augments the `AuditActionMap` interface with a `cart` key whose value is the union of the two action names above.

## Relationships
- **`src/modules/cart/services/items.ts`** – expected emitter of `USER_CART_ITEM_REMOVED` when a cart line is deleted.
- **`src/modules/cart/services/reorder.ts`** – expected emitter of `USER_CART_REORDERED` when an order's items are re-added to the cart.
- **`src/modules/cart/tests/unit/audit.test.ts`** – unit-tests the exports and the module augmentation.

## Notes
- Actions use the `user.` prefix (not `admin.`) because a customer performs them on their own cart; this is the only customer-initiated action in the cart module.
- The doc comment cross-references `modules/account/audit.ts` for the rationale behind using declaration merging instead of a shared enum for action names.
- `USER_CART_REORDERED` is expected to carry metadata identifying the source order (per the inline comment), but the metadata shape is not defined here.
