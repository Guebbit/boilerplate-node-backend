# src/modules/cart/services/index.ts

## Purpose

Barrel file for the cart service layer. Re-exports the individual cart operations (read, write, checkout, reorder, cleanup) so that controllers and cross-module callers have a single import path. Also assembles all of them into the `cartService` namespace object, which is the canonical entry point for callers. The cart service lives in a folder rather than one file because it exceeded the ~300-line threshold defined in `docs/theory/layers.md`.

## Key elements

- **`cartService` (object)** — The namespace that bundles every cart operation. Controllers and sibling modules call through this object, never the bare functions.
- **Re-exports from `./items`** — `cartGet`, `cartGetForBadge`, `cartGetForView`, `cartItemSetById`, `cartItemAdd`, `cartItemUpdateQuantity`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`: read/write cart line items.
- **Re-export from `./checkout`** — `orderConfirm`: converts a cart into a confirmed order.
- **Re-export from `./cleanup`** — `cartDeleteByUserId`, `productRemoveFromCartsById`: tear down carts on user or product deletion.
- **`reorderIntoCart` (import only, no named re-export)** — Refills a cart from a prior order. Available exclusively via `cartService.reorderIntoCart`.
- **Type exports are intentionally omitted** — Line types remain in `./view`; this barrel does not re-export them.

## Relationships

- **Consumed by** all cart controllers (`get-cart`, `post-cart`, `put-cart-item`, `delete-cart-item`, `delete-cart-all`, `post-checkout`, `post-reorder`, `get-cart-summary`) via the `cartService` object.
- **Wired by** `src/modules/cart/module.ts`, which registers `cartDeleteByUserId` and `productRemoveFromCartsById` as event handlers (user/product deletion).
- **Re-exports from** `services/items.ts`, `services/checkout.ts`, `services/reorder.ts`, `services/cleanup.ts`.
- **Tested by** `src/modules/account/tests/integration/addresses.test.ts`, which exercises cleanup paths that interact with cart data.

## Notes

- `reorderIntoCart` is the only operation available **only** through the `cartService` namespace, not as a named re-export. Importing `{ reorderIntoCart }` from this file will fail; use `cartService.reorderIntoCart`.
- Line *types* are deliberately not re-exported here. Callers that need them should import from `./view` directly, matching the existing import pattern in `items.ts` and `checkout.ts`.
- The comment block warns against adding a barrel re-export for types "nobody asks the barrel for" — resist the temptation to add one.
