---
source: src/modules/cart/services/index.ts
sha256: 048c9ad590192ebca66ba273d339c20dff485eebcd0a6624a5b878843496c223
generated_at: 2026-10-15T10:24:29.237242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/index.ts

## Purpose

Barrel (re-export) file for the cart services sub-module. It collects the public API from the individual service files (`items`, `checkout`, `reorder`, `merge`, `cleanup`, `shelf`) and publishes them both as named exports and as the single `cartService` object that controllers consume. It exists as a thin forwarding layer so callers never import sub-files directly.

## Key elements

- **Named re-exports** — pulls `cartGet`, `cartGetForBadge`, `cartGetForView`, `cartItemSetById`, `cartItemAdd`, `cartItemUpdateQuantity`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`, `cartShippingMethodSet` from `./items`; `orderConfirm` + `CheckoutChoices` type from `./checkout`; `cartDeleteByUserId`, `productRemoveFromCartsById` from `./cleanup`; `cartMerge` + `MergeResult` type from `./merge`; `productAvailabilityFor` from `./shelf`.
- **`cartService` object** — a plain object bundling all of the above (plus `reorderIntoCart` from `./reorder`) under one namespace. Controllers and sibling modules call through this object rather than the bare named exports.
- **Type re-exports** — `CheckoutChoices` and `MergeResult` are the only types surfaced from this barrel. Cart line types intentionally remain in `./view` and are *not* re-exported here.

## Relationships

- **All cart controllers** (`get-cart`, `get-cart-summary`, `post-cart`, `put-cart-item`, `put-cart-shipping-method`, `delete-cart-item`, `delete-cart-all`, `post-cart-merge`, `post-reorder`, `post-checkout`) import their operations from this barrel (via `cartService` or the named exports).
- **`src/modules/cart/module.ts`** — imports `cartDeleteByUserId` and `productRemoveFromCartsById` directly by name (not through `cartService`) to wire them into the user-deletion and product-deletion event handlers.
- **`src/modules/cart/index.ts`** — the module-level public entry point that likely re-exports or references this services barrel.
- **`src/modules/cart/services/checkout.ts`** and **`src/modules/cart/services/cleanup.ts`** — the two sub-files whose functions are lifted through this barrel; they also interact with each other (checkout finalizes a cart, cleanup tears it down).
- **`src/modules/addresses/tests/integration/checkout.test.ts`** — integration test that exercises the checkout flow end-to-end, exercising `orderConfirm` and related cart reads through this API surface.

## Notes

- The doc comment states the folder split was a size decision (~300 lines threshold); see `docs/theory/layers.md` for the layering rationale.
- Callers are expected to use the `cartService` namespace object, **not** the bare named exports, per the inline comment. The bare exports exist primarily so `module.ts` can grab the two cleanup functions by name for event wiring.
- `reorderIntoCart` appears in `cartService` but has **no** corresponding named re-export at the top level—consumers must go through the object.
- Line/cart-row types live in `./view` and are deliberately absent from this barrel to avoid an extra name to keep in sync.
