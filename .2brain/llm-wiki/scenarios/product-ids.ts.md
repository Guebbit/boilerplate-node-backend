---
source: scenarios/product-ids.ts
sha256: cae62893c71d3b7c995842eb0c357c461d17fc74e2b614c6a07b160c72ac744c
generated_at: 2026-10-29T01:24:09.340402+00:00
model: ollama:qwen3.8:27b
---

# scenarios/product-ids.ts

## Purpose

A single, dependency-free export of pinned catalogue product IDs for the `products` scenario strip. It exists as a separate module (rather than living in `./subjects.ts`) so that generated API collections can read the IDs without importing a module that has its own imports. All consumers reference it by product name + the branch it exercises instead of repeating raw hex strings.

## Key elements

- **`SEED_PRODUCT_IDS`** (exported, `as const`) — a flat object of 11 string-literal IDs, each named for the product *and* the edge case it covers (e.g. `heaterSoftDeleted`, `bundleInactive`, `bowlNoWithdrawal`, `puppyCourseDigital`). The names make the intent of each row checkable at the call site.

## Relationships

- **`scenarios/products.ts`** — reads `SEED_PRODUCT_IDS` to look up specific catalogue rows.
- **`scenarios/wishlist.ts`** — reads `SEED_PRODUCT_IDS` to target products in wishlist operations.
- **`scenarios/flows/shop-history.ts`** — reads `SEED_PRODUCT_IDS` to reference products in shop-history flow steps.
- **`scenarios/shop.scenario.ts`** / **`scenarios/values/products.ts`** — part of the same `products` strip; the file's module doc states the strip deletes this file together with the shop, and all files that name the IDs travel with it.

## Notes

- **Zero imports is a hard requirement.** The file must not gain any `import` statement, or generated API collections will break (they load it in a module-less context).
- **Removal is atomic with the products strip.** If the shop scenario is deleted, this file goes with it along with every consumer that names the IDs.
- **Names encode intent, not just identity.** When adding a new ID, follow the `productBranch` convention (e.g. `bowlLowStock`) so the purpose is visible without reading the test.
- The `as const` assertion means each value is a unique literal type; consumers can compare or exhaust over them if needed.
