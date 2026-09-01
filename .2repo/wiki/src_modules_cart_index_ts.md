# src/modules/cart/index.ts

## Purpose

Public barrel file for the cart module. It is the **only** import surface available to sibling modules, re-exporting a single symbol (`cartService`) to enforce the rule that cross-module access must go through the service layer.

## Key elements

- **`cartService`** (re-export from `./services`) — the sole public API of the cart module. Sibling modules interact with cart logic exclusively through this service.
- **Intentionally omitted:** `cartRepository` and the cart model are *not* re-exported. The inline comment explains the rationale: exposing the repository would let a sibling bypass service-layer rules, and no sibling embeds a cart, so the model shape is not needed externally.

## Relationships

- **`src/modules/cart/services/index.ts`** — the source of the `cartService` re-export; this barrel is a thin pass-through to that file.
- **`src/modules/wishlist/service.ts`** — a sibling module that may import `cartService` through this barrel to coordinate wishlist ↔ cart behavior.
- **`src/modules/cart/tests/integration/stock.test.ts`** — integration test exercising cart stock behavior; likely imports `cartService` via this barrel or its service layer.

## Notes

- The header comment points to `modules/products/index.ts` as the canonical example of the barrel-file rule. If you're adding a new module, mirror this pattern: one barrel, service-level exports only.
- Do **not** add `cartRepository` or model types to this file. The exclusion is deliberate and documented.
