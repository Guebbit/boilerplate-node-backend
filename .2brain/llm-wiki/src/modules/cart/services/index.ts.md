---
source: src/modules/cart/services/index.ts
sha256: bf606b2d697ba488f08a7963dd3661afb93f966173a74bfba9ebf7c3ce633ba9
generated_at: 2026-11-08T05:17:00.606319+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/index.ts

## Purpose

Barrel file for the cart service layer. It aggregates the six sub-service modules (`items`, `checkout`, `reorder`, `merge`, `cleanup`, `shelf`) behind a single `cartService` object so that controllers and other modules never import individual flow files directly. This keeps the public API surface in one place and enforces the one-file-per-flow convention documented in `docs/theory/layers.md`.

## Key elements

- **`cartService`** – The sole named export (besides the two types). A plain object whose properties map to individual operations:
  - `get`, `getForBadge`, `getForView` – read cart (from `items`)
  - `addItem`, `addItemById`, `setItemById`, `updateItemQuantity`, `removeItemById`, `remove` – mutate cart items (from `items`)
  - `setShippingMethod` – select/switch shipping (from `items`)
  - `orderConfirm` – finalize an order (from `checkout`)
  - `reorderIntoCart` – re-create a cart from a past order (from `reorder`)
  - `merge` – combine another cart into this one (from `merge`)
  - `deleteByUserId`, `productRemoveFromCartsById` – cleanup/invalidation (from `cleanup`)
  - `productAvailabilityFor` – check stock against cart (from `shelf`)
- **`CheckoutChoices`** (type re-export) – parameter shape for the checkout flow, sourced from `./checkout`.
- **`MergeResult`** (type re-export) – return shape of the merge operation, sourced from `./merge`.

## Relationships

- **Controllers** (`get-cart`, `get-cart-summary`, `post-cart-items`, `patch-cart-item`, `delete-cart-item`, `delete-cart-items`, `put-cart-shipping-method`, `post-checkout`, `post-reorder`, `post-cart-merge`) all call through `cartService` rather than importing sub-service files directly.
- **`src/modules/cart/index.ts`** – re-exports `cartService` (and the two types) so the module's public API is stable regardless of internal file layout.
- **`src/modules/cart/module.ts`** – registers the cart module; consumers resolve services through the module registry, which ultimately resolves to this file's exports.
- **`src/modules/cart/services/checkout.ts`** and **`src/modules/cart/services/cleanup.ts`** – imported and spread into `cartService`; they are the most commonly referenced sub-modules by external consumers.
- **`src/modules/addresses/tests/integration/checkout.test.ts`** – integration test that exercises the `orderConfirm` path via this service.

## Notes

- The JSDoc explicitly states controllers and siblings must call through `cartService`, **never** the bare sub-module functions. If you see a direct `import { cartGet } from './items'` in a controller, that violates the convention.
- Property names on `cartService` are intentionally *not* 1:1 with the source function names (e.g., `items.cartGet` → `cartService.get`, `items.cartItemAdd` → `cartService.addItem`). The mapping is the contract; the source names are internal.
- `items` is imported as a namespace but its individual functions are not re-exported—only the two type re-exports from `checkout` and `merge` exist at the top level.
