---
source: src/modules/cart/services/index.ts
sha256: bf606b2d697ba488f08a7963dd3661afb93f966173a74bfba9ebf7c3ce633ba9
generated_at: 2026-10-29T03:24:21.020136+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/index.ts

## Purpose

Barrel (namespace) export for the cart service layer. It aggregates sub-service modules (`items`, `checkout`, `reorder`, `merge`, `cleanup`, `shelf`) into a single `cartService` object so that controllers and sibling modules have one consistent entry point rather than reaching into individual service files.

## Key elements

- **`cartService`** — the sole runtime export; a plain object that maps short method names (`get`, `addItem`, `remove`, `setShippingMethod`, `orderConfirm`, `reorderIntoCart`, `merge`, `deleteByUserId`, `productAvailabilityFor`, `productRemoveFromCartsById`, etc.) to functions from the sub-service modules.
- **`CheckoutChoices`** (type re-export from `./checkout`) — input shape for the checkout flow.
- **`MergeResult`** (type re-export from `./merge`) — return shape for cart-merge operations.

## Relationships

- **Consumed by every cart controller** (`get-cart`, `get-cart-summary`, `patch-cart-item`, `post-cart-items`, `delete-cart-item`, `delete-cart-items`, `post-cart-merge`, `post-checkout`, `post-reorder`, `put-cart-shipping-method`). Each controller calls `cartService.<method>` rather than importing the underlying service file directly.
- **`src/modules/cart/index.ts` / `module.ts`** — re-exports or wires `cartService` into the broader module graph.
- **`src/modules/cart/services/checkout.ts`** — source of `orderConfirm` and the `CheckoutChoices` type.
- **`src/modules/cart/services/cleanup.ts`** — source of `deleteByUserId` and `productRemoveFromCartsById`.
- **`src/modules/addresses/tests/integration/checkout.test.ts`** — integration test that exercises the checkout path through `cartService.orderConfirm`.

## Notes

- The file's doc comment and the `cartService` doc comment both state the convention: **callers must use `cartService.<method>`; importing the bare functions from sub-files is discouraged.**
- Sub-services are split one-file-per-flow (items, checkout, reorder, merge, cleanup, shelf) per `docs/theory/layers.md` rather than living in a single monolith.
- Adding a new cart operation means creating/locating the function in the appropriate sub-service file, then adding a key to the `cartService` object here.
