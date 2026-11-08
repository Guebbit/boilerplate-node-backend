---
source: scenarios/product-ids.ts
sha256: cae62893c71d3b7c995842eb0c357c461d17fc74e2b614c6a07b160c72ac744c
generated_at: 2026-11-08T02:30:40.831310+00:00
model: ollama:qwen3.8:27b
---

# scenarios/product-ids.ts

## Purpose

A zero-import, single-export module that centralises the MongoDB ObjectIds used by product-related test scenarios. It exists so that generated API collections can read the ids without pulling in any runtime module, and so that every consumer names the id by intent (product + branch under test) rather than repeating a raw hex string.

## Key elements

- **`SEED_PRODUCT_IDS`** (`as const` object) — Read-only map of 11 descriptive keys (`dogFoodStandard`, `heaterSoftDeleted`, `scratchPostOutOfStock`, `dogBedPremium`, `bundleInactive`, `barebones`, `puppyCourseDigital`, `bowlLowStock`, `bowlNoWithdrawal`, `catTreeHeavy`, `bedOffSale`) to their 24-character hex ObjectIds. Each key states both the product and the fixture branch it exists to exercise.

## Relationships

- **`scenarios/products.ts`** — Reads `SEED_PRODUCT_IDS` in place of hard-coded hex strings.
- **`scenarios/wishlist.ts`** — Reads `SEED_PRODUCT_IDS` for the same reason.
- **`scenarios/flows/shop-history.ts`** — Reads `SEED_PRODUCT_IDS` for the same reason.

All three consumers import this file rather than `./subjects.ts` specifically because this file has no imports of its own.

## Notes

- **Zero imports by design.** The module deliberately avoids any `import` so tooling that generates API collections can parse it standalone. Adding an import would break that invariant.
- **Lifecycle is tied to the `products` strip.** The file's own docstring states it is deleted together with the shop; any code that references it is expected to be removed in the same pass.
- **`as const`** makes every key and value readonly, so downstream code cannot accidentally reassign or widen the types.
