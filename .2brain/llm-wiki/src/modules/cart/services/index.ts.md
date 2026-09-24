---
source: src/modules/cart/services/index.ts
sha256: 848597299517357b0841d2d9decf866f8cca5ed9bc2cc4516bb44a7747b850c9
generated_at: 2026-09-23T18:32:29.244039+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/index.ts

## Purpose

Barrel (index) file for the cart service folder. It aggregates the individual service sub-modules (`items`, `checkout`, `reorder`, `cleanup`) into a single entry point so that controllers and other modules can import one object (`cartService`) rather than reaching into each sub-file. The folder exists because the combined surface exceeded the ~300-line threshold described in `docs/theory/layers.md`.

## Key elements

- **Named re-exports** — Individual functions lifted from `./items` (`cartGet`, `cartGetForBadge`, `cartGetForView`, `cartItemSetById`, `cartItemAdd`, `cartItemUpdateQuantity`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`), `./checkout` (`orderConfirm`), and `./cleanup` (`cartDeleteByUserId`, `productRemoveFromCartsById`). These exist for `module.ts` event wiring and the unit test suite, which drive operations directly.
- **`cartService` (const object)** — The primary public API. Bundles all the above _plus_ `reorderIntoCart` from `./reorder` into a single namespace. Controllers and sibling modules are expected to call through this object exclusively.
- **`reorder` import** — `./reorder` is imported but **not** re-exported by name; `reorderIntoCart` is reachable only via `cartService.reorderIntoCart`.

## Relationships

- **Downstream (imports):** `./items`, `./checkout`, `./reorder`, `./cleanup` — each supplies the functions re-exported here.
- **Upstream (consumers):**
    - All cart controllers (`get-cart`, `post-cart`, `put-cart-item`, `delete-cart-item`, `delete-cart-all`, `get-cart-summary`, `post-checkout`, `post-reorder`) consume the `cartService` object.
    - `src/modules/cart/module.ts` uses the named exports (`cartDeleteByUserId`, `productRemoveFromCartsById`) to register cleanup handlers on user/product deletion events.
    - `src/modules/cart/index.ts` re-exports this barrel outward.
    - `src/modules/addresses/tests/integration/addresses.test.ts` references cart operations (likely via the controller path).

## Notes

- `reorderIntoCart` is the **only** function available solely through the `cartService` object; there is no standalone named export for it.
- Type definitions (line/cart types) intentionally live in `./view` and are **not** re-exported from this file. Callers that need them import directly from `./view`.
- The in-code comment is explicit: _"controllers and siblings call through this, never the bare functions."_ Treating the named exports as an internal/test-only surface is the intended convention.
