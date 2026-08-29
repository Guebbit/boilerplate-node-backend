# src/modules/cart/audit.ts

## Purpose

Declares the cart domain's audit action identifiers and registers them into the shared `AuditActionMap` via TypeScript module augmentation. It exists so that cart-related audit emissions (item removal, bulk reorder) carry stable, typed action names that the observability layer can reference without a centralized enum.

## Key elements

- **`cartAuditActions`** — A `const` object with two string-literal actions:
  - `USER_CART_ITEM_REMOVED` (`'user.cart.item_removed'`) — emitted when a single line item disappears from a customer's cart.
  - `USER_CART_REORDERED` (`'user.cart.reordered'`) — emitted when an entire order's lines re-enter the cart at once.
- **`declare module '@infrastructure/observability/audit'`** — Augments the `AuditActionMap` interface with a `cart` key typed to the union of `cartAuditActions` values, making the action strings available to any code that imports that module.

## Relationships

- **`src/modules/cart/services/items.ts`** — Consumes `cartAuditActions.USER_CART_ITEM_REMOVED` when a cart item is removed, attaching the action to the audit event.
- **`src/modules/cart/services/reorder.ts`** — Consumes `cartAuditActions.USER_CART_REORDERED` when a reorder re-populates the cart; the order identifier is passed as metadata.
- **`src/modules/cart/tests/unit/audit.test.ts`** — Unit-tests the shape and values of `cartAuditActions` and the module augmentation.

## Notes

- Actions are prefixed `user.`, not `admin.`, because a customer (not an admin) performs both actions on their own cart. This is the one cart action category where the actor is the end user.
- The file deliberately uses **module augmentation** rather than a shared enum. The rationale (and the pattern to follow) is documented in `modules/account/audit.ts`; do not introduce a new enum for cart actions.
- Both actions are read-only records — they do not mutate cart state themselves. They exist purely so the audit trail can answer support questions ("Why is my item gone?" / "Why is my cart suddenly full?").
