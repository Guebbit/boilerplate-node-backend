---
source: src/modules/products/domain/stock.ts
sha256: d2813e889a307509d4d43a405e73e9574b35730718be89c6c65ab973134808af
generated_at: 2026-10-29T05:26:01.268830+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/stock.ts

## Purpose

Pure functions that derive customer-facing stock information (available units, preorder allowance, and in-stock/low-stock flags) from the raw `onHand` / `reserved` / `backorderLimit` counters written by the inventory layer. It lives in the product domain so that catalogue price and availability remain this module's own invariant, consistent with the layering rule that kernel and domain layers carry no business logic of their own.

## Key elements

- **`availableStock(onHand?, reserved?)`** — Returns `max(0, onHand − reserved)`. Treats absent counters as zero. This is the single source of truth for "how many units can a customer buy right now."
- **`UNLIMITED_ALLOWANCE_SHOWN`** — Private constant (`999_999`). Shown as the allowance when `backorderLimit` is `null` (no cap); the contract requires an integer and the real count is never exposed.
- **`preorderAllowanceLeft(backorderLimit?, backordered?)`** — Returns `max(0, backorderLimit − backordered)`, or `UNLIMITED_ALLOWANCE_SHOWN` when `backorderLimit` is `null`. Absent `backorderLimit` (not `null`) reads as 0, i.e. the preorder is closed.
- **`stockFlags(available, threshold)`** — Returns `{ inStock, lowStock }`. `lowStock` is only `true` while `inStock` is also `true` (an empty shelf is never "low stock").

## Relationships

- **`domain/backorder.ts`** — Supplies the `backorderLimit` and `backordered` semantics that `preorderAllowanceLeft` consumes; together they define the preorder/allowance contract.
- **`domain/buyable.ts`** — Downstream consumer: determines whether a product is purchasable, relying on the values `stock.ts` produces.
- **`domain/index.ts`** — Barrel file that re-exports `availableStock`, `preorderAllowanceLeft`, and `stockFlags` for the rest of the module.
- **`presenter.ts`** — Calls `stockFlags` (and likely `availableStock`) to shape the two boolean fields on every product response.
- **`tests/factories.ts`** — Provides fixture products with realistic `onHand`/`reserved`/`backorder` values used by stock tests.
- **`tests/unit/stock.test.ts`** — Direct unit tests for all three exported functions and the `null`-vs-`undefined` allowance distinction.

## Notes

- `backorderLimit: undefined` means "no preorder allowed" (closes at 0); `backorderLimit: null` means "unlimited." Do not confuse the two.
- `stockFlags` intentionally makes `lowStock` a subset of `inStock`; callers must not treat them as independent booleans.
- All three exports are pure, side-effect-free functions with no module-level state (other than the display constant), making them trivially testable in isolation.
