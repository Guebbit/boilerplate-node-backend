---
source: src/modules/cart/services/index.ts
sha256: b68587b74014744c1f31d1b3dcab1e7354acf903d986c465f7acfb9c00e26d0d
generated_at: 2026-09-27T14:46:20.062567+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/index.ts

## Purpose

Barrel (facade) file for the cart service layer. It re-exports the individual service functions from `items.ts`, `checkout.ts`, `cleanup.ts`, and `reorder.ts` both as named exports and as a single `cartService` object, giving controllers and sibling modules one import point for all cart operations. It exists as a folder-plus-index rather than a single file because the service exceeded ~300 lines (see `docs/theory/layers.md`).

## Key elements

- **Named re-exports** — `cartGet`, `cartGetForBadge`, `cartGetForView`, `cartItemSetById`, `cartItemAdd`, `cartItemUpdateQuantity`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`, `cartShippingMethodSet` (from `./items`); `orderConfirm` (from `./checkout`); `cartDeleteByUserId`, `productRemoveFromCartsById` (from `./cleanup`).
- **`cartService` (const object)** — The canonical namespace export. Bundles all of the above *plus* `reorderIntoCart` (from `./reorder`) into a single object. Controllers and sibling modules are expected to call through this object rather than the bare named functions.
- **`./reorder`** — Imported and exposed only via `cartService.reorderIntoCart`; it is *not* listed among the named exports.
- **`./view`** — Referenced in the header doc-comment (it holds line-to-product joins) but not imported here.

## Relationships

- **`src/modules/cart/services/items.ts`, `checkout.ts`, `cleanup.ts`, `reorder.ts`** — Direct dependencies; this file imports each as a namespace and re-exports selected members.
- **Cart controllers** (`get-cart`, `get-cart-summary`, `post-cart`, `put-cart-item`, `delete-cart-item`, `delete-cart-all`, `put-cart-shipping-method`, `post-checkout`, `post-reorder`) — Consume `cartService` (or the named exports) for their business logic.
- **`src/modules/cart/module.ts`** — Wires `cleanup.cartDeleteByUserId` and `cleanup.productRemoveFromCartsById` into the domain events that trigger them.
- **`src/modules/cart/index.ts`** — Upward-facing barrel that re-exposes this module (and its controllers) to the rest of the app.
- **`src/modules/addresses/tests/integration/addresses.test.ts`** — Integration test that exercises cart behavior alongside address flows.

## Notes

- **Dual export pattern is intentional.** Named exports exist so `module.ts` can wire events and the test suite can call item operations directly without the namespace. The `cartService` object is the path controllers use. Adding a function to one surface without the other will create a silent gap.
- **`reorderIntoCart` is asymmetric.** It appears in `cartService` but has no named re-export. If a test or event-wiring site needs it directly, add the named export here.
- **`view.ts` is a sibling, not a dependency of this file.** The header comment mentions it for orientation only; do not expect it to be imported here.
- **Line-type re-exports are deliberately omitted.** The comment notes that a barrel line for a type "nobody asks the barrel for" would be a maintenance burden; import types from `./view` directly.
