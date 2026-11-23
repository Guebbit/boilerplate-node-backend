---
source: scenarios/product-ids.ts
source_sha256: cae62893c71d3b7c995842eb0c357c461d17fc74e2b614c6a07b160c72ac744c
context_sha256: e4321247a3f4eca123cce429bd7bfe99b993fbd33fef4be82f39bb985a8daa4c
generated_at: 2026-11-22T01:44:16.844178+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/product-ids.ts

## Purpose
Holds the pinned catalogue (product) ids used by the test scenarios. It is kept separate from `./subjects.ts` and imports nothing, so the generated API collections can read the ids without loading a module. It belongs to the `products` strip: the strip deletes this file along with the shop, and everything that names it goes with it.

## Key elements
- `SEED_PRODUCT_IDS` — a `const` object mapping descriptive names to 24-character hex product ids. Each name states the product and the branch the row exists to exercise:
  - `dogFoodStandard`
  - `heaterSoftDeleted`
  - `scratchPostOutOfStock`
  - `dogBedPremium`
  - `bundleInactive`
  - `barebones`
  - `puppyCourseDigital`
  - `bowlLowStock`
  - `bowlNoWithdrawal`
  - `catTreeHeavy`
  - `bedOffSale`

## Relationships
- `scenarios/products.ts`, `scenarios/wishlist.ts` and `scenarios/flows/shop-history.ts` are named in the file's doc comment as readers of these ids, so they don't repeat the hex strings.
- `scenarios/shop.scenario.ts` and `scenarios/values/products.ts` are graph neighbors. The file's content doesn't say how they use it.

## Notes
- The file has no imports, which is deliberate. Keep it that way so the generated API collections can still read it without loading a module.
- Names carry the test intent, for example "only visible products are saved". That intent can be checked by eye rather than trusted from a comment next to a raw id.
- `as const` makes the values literal types.
