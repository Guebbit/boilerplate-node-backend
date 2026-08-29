# src/modules/cart/index.ts

## Purpose

Public barrel (the single import surface) for the cart module. Sibling modules must import only through this file; it exists to enforce the module-boundary rule and to keep the internal repository, model, and document type inaccessible to the rest of the codebase.

## Key elements

- **`cartService`** — re-exported from `./services`. The sole thing this barrel exposes. All cross-module cart interaction (add, get, validate) flows through this one object.

## Relationships

- **`src/modules/cart/services/index.ts`** — the sole re-export source. All logic lives behind `cartService` here.
- **`src/modules/wishlist/service.ts`** — calls `cartService` to move a saved wishlist line into the cart. Through that call it inherits the product-eligibility rules defined in `services/items.ts`.

## Notes

- `cartRepository` is **deliberately not exported**. Publishing it would give every sibling module a raw write path that bypasses the service layer and its validation. `tests/cross-cutting/published-repositories.test.ts` enforces its absence.
- The cart model and its document type stay internal — nothing embeds a cart, so no sibling needs its shape.
- A former cross-module reader (a SPEC in `products`) previously poked the repository directly to observe deletion side-effects; it now uses `cartService.cartGet`, going through the same public door as everyone else.
- The module-boundary rule referenced here is documented in `modules/products/index.ts`.
