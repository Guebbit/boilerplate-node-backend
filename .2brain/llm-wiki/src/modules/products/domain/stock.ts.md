---
source: src/modules/products/domain/stock.ts
sha256: d2813e889a307509d4d43a405e73e9574b35730718be89c6c65ab973134808af
generated_at: 2026-11-08T07:44:04.054466+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/stock.ts

## Purpose

Pure calculation helpers that derive a customer-facing stock picture (available units, remaining preorder allowance, and display flags) from the raw `onHand` / `reserved` counters that the inventory module writes onto a product. It lives in the products domain rather than in `inventory` or `cart` because a product's catalogue availability is a product invariant, following the same layering rationale as `tax.ts`.

## Key elements

- **`availableStock(onHand?, reserved?)`** — Returns units a customer may buy, clamped at zero. Both parameters are optional and read as `0` when absent.
- **`UNLIMITED_ALLOWANCE_SHOWN`** (private constant, `999_999`) — Sentinel value returned in place of an actual count when a backorder allowance has no cap.
- **`preorderAllowanceLeft(backorderLimit?, backordered?)`** — Returns remaining preorder units (clamped at zero), or `UNLIMITED_ALLOWANCE_SHOWN` when `backorderLimit` is `null`. A `undefined` `backorderLimit` means the allowance is closed (zero).
- **`stockFlags(available, threshold)`** — Returns `{ inStock: boolean; lowStock: boolean }`. `lowStock` is only ever true while `inStock` is also true.

## Relationships

- **`domain/backorder.ts`** — Supplies the `backorderLimit` and `backordered` values consumed by `preorderAllowanceLeft`.
- **`domain/buyable.ts`** — Likely composes `availableStock` / `stockFlags` to decide whether a product is purchasable.
- **`domain/index.ts`** — Barrel re-export; makes the three public functions available to the rest of the product module.
- **`presenter.ts`** — Consumes `stockFlags` (and possibly `availableStock`) to shape the two boolean flags and availability count in API responses.
- **`tests/unit/stock.test.ts`** — Unit tests for all exported functions.
- **`tests/factories.ts`** — Provides test fixtures that populate the `onHand` / `reserved` / `backorderLimit` fields these functions read.

## Notes

- `backorderLimit` is **tri-state**: `undefined` → allowance closed (0), `null` → no cap (unlimited), a number → finite cap. Callers must not confuse `undefined` with `null`.
- `UNLIMITED_ALLOWANCE_SHOWN` is a display sentinel (`999_999`), not `Infinity`; downstream code that compares it numerically should treat it as "effectively unlimited," not a real unit count.
- `lowStock` and `inStock: false` are mutually exclusive by construction — an empty shelf is simply "out of stock," never "low stock."
- The file's doc comment explicitly cites `docs/theory/layers.md` as the reason it is co-located with the product model rather than in the inventory module; moving it would violate the layering contract.
