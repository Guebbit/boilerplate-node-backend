---
source: src/modules/cart/services/index.ts
source_sha256: fa8f9bb0dad14933c0f8a1f06e97451e6867a25ff8522329f810fbcd2e4392d3
context_sha256: 74ce11b30a1f4f1cbdfc66505883d6220907de19544e3f62be503580286bbb9e
generated_at: 2026-11-22T04:35:55.976157+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/services/index.ts

## Purpose
Barrel file for the cart module's services. It assembles functions from the per-flow service files (`items`, `checkout`, `reorder`, `merge`, `cleanup`, `shelf`) into a single `cartService` object, so controllers and sibling modules call the cart through one entry point instead of importing the bare functions. Carts are identified by `userId`.

## Key elements
- `cartService`: the exported object, which maps friendly method names to implementations:
  - **Reads:** `get`, `getForBadge`, `getForView` (from `items`).
  - **Item and cart mutations:** `setItemById`, `addItem`, `updateItemQuantity`, `addItemById`, `removeItemById`, `remove`, `setShippingMethod` (from `items`).
  - **Checkout:** `orderConfirm` (from `checkout`).
  - **Reorder:** `reorderIntoCart` (from `reorder`).
  - **Merge:** `merge` (from `merge`, which is `cartMerge`).
  - **Cleanup:** `deleteByUserId` and `productRemoveFromCartsById` (from `cleanup`).
  - **Shelf:** `productAvailabilityFor` (from `shelf`).
- Type re-exports: `CheckoutChoices` (from `./checkout`) and `MergeResult` (from `./merge`).

## Relationships
- **Controllers** (`src/modules/cart/controllers/delete-cart-item.ts`, `delete-cart-items.ts`, `get-cart.ts`, `get-cart-summary.ts`, `patch-cart-item.ts`, `post-cart-items.ts`, `post-cart-merge.ts`, `post-checkout.ts`, `post-reorder.ts`, `put-cart-shipping-method.ts`) are the consumers of this barrel. The names of these files suggest they map onto the methods above, but the file itself doesn't show which calls they make.
- **`src/modules/cart/services/checkout.ts`** and **`src/modules/cart/services/cleanup.ts`** are imported directly. They supply `orderConfirm` and the `CheckoutChoices` type, and `deleteByUserId` and `productRemoveFromCartsById`.
- **`src/modules/cart/index.ts`** and **`src/modules/cart/module.ts`** are module-level neighbors that sit alongside this barrel.
- **`src/modules/addresses/tests/integration/checkout.test.ts`** is linked in the graph, so it likely exercises checkout through this service.

## Notes
- The doc comment says to call through `cartService` and never the bare functions. This applies to siblings as well as controllers.
- The service is organized as one file per flow rather than one large file. New operations belong in the matching flow file and then need registering here.
- Method names here differ from the underlying function names (for example, `get` is `cartGet` and `merge` is `cartMerge`).
