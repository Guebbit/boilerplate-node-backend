---
source: src/modules/products/domain/stock.ts
sha256: c53eb5f3b2687a91dc9d600d7e724f39bece500e0eb2edf05c2c2df08cfc5dee
generated_at: 2026-10-15T11:41:36.333044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/stock.ts

## Purpose

Pure domain functions that derive customer-facing stock information (`available` count, `inStock`/`lowStock` flags) from the two raw counters (`onHand`, `reserved`) that the inventory module writes onto products. Lives here rather than in `inventory` or `cart` because stock availability is a product-domain invariant, mirroring how `tax.ts` owns `resolveTaxRate`.

## Key elements

- **`availableStock(onHand?, reserved?)`** — Returns `max(0, onHand − reserved)`. Both parameters are optional and default to `0` when absent. Guarantees the result is never negative.
- **`stockFlags(available, threshold)`** — Returns `{ inStock: boolean; lowStock: boolean }`. `inStock` is true when `available > 0`. `lowStock` is true only when `available > 0 && available <= threshold` — an empty shelf yields `{ inStock: false, lowStock: false }`, never `lowStock: true` on its own.

## Relationships

- **`src/modules/products/domain/index.ts`** — Re-exports both functions so the rest of the module tree can import them from the domain barrel.
- **`src/modules/products/presenter.ts`** — Calls `availableStock` and `stockFlags` to populate the `available`, `inStock`, and `lowStock` fields on product response objects.
- **`src/modules/products/tests/factories.ts`** — Provides fixture products whose `onHand`/`reserved` values feed into these functions during tests.
- **`src/modules/products/tests/unit/stock.test.ts`** — Unit-tests the clamp-at-zero behavior, the undefined-input defaults, and the `lowStock` mutual-exclusivity rule.

## Notes

- `lowStock` and `inStock` are not independent booleans: `lowStock: true` always implies `inStock: true`. Consumers should not treat them as a free 2×2 combination.
- Both functions are pure and side-effect-free; there is no state, no imports, and no async work.
- The `??` (nullish) default means a `null` or `undefined` counter is treated as zero — but a `NaN` input would propagate through `Math.max` and yield `NaN`. Callers upstream are expected to never pass `NaN`.
