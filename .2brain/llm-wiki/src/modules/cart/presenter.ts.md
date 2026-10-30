---
source: src/modules/cart/presenter.ts
sha256: f5492c6572a1fa5e376972094635eac18465da65e3d1710f5962de9bbd0867c1
generated_at: 2026-10-29T03:22:42.066011+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/presenter.ts

## Purpose

Pure shaping layer that converts a cart's pre-computed facts into the `CartResponse` wire format declared by `openapi.yaml`. All arithmetic is done upstream by the services; this file only assembles fields and derives two client-facing flags (`canIncrease`, `checkoutable`) that the API consumer would otherwise re-compute.

## Key elements

- **`CartView`** — type alias for `CartResponse`; the file's output contract.
- **`JudgedCartLine`** — a single cart line carrying `productId`, `quantity`, and the `LineAvailability` already determined by the shared domain rule.
- **`CartFacts`** — the input shape: judged lines, pre-summed counts/totals, shipping, currency, and the per-line ceiling. No computation happens here.
- **`presentCart(facts): CartView`** — the sole exported function. Maps lines to wire items (adding `canIncrease = quantity < lineMax`), assembles the `summary` block (including `expectedTotal` via `toMinorUnits`), and sets `checkoutable` to true only when at least one line exists and every line's availability passes `isBuyable`.

## Relationships

- **`src/types/index.ts`** — imports the wire types (`CartResponse`, `CartShipping`, `LineAvailability`) that define the output contract.
- **`src/domain-primitives/money.ts`** — imports `toMinorUnits` to produce `summary.expectedTotal` so it matches the conversion checkout compares against.
- **`src/modules/cart/domain/index.ts`** → **`src/modules/cart/domain/availability.ts`** — imports `isBuyable` (re-exported through the domain barrel) to gate `checkoutable`.
- **`src/modules/cart/services/view.ts`** — the upstream caller; it reads lines, ledger, and shipping options and hands the assembled `CartFacts` to `presentCart`.
- **`src/modules/cart/services/items.ts`** — provides the line counts and gross totals referenced in `CartFacts` (the docstring notes "as `sumLineItems` counts them").
- **`src/modules/cart/index.ts`** — module barrel that re-exports this presenter for external consumers.

## Notes

- `expectedTotal.amount` uses `toMinorUnits(totalPrice, currency)` — the same conversion checkout validates against. Changing one without the other will cause a mismatch on the wire.
- `canIncrease` is per-line and depends on the shop's `lineMax` (sourced from `cartLineMax()`), not on stock or availability.
- `checkoutable` is an all-or-nothing flag: a single non-buyable line makes the entire cart non-checkoutable, even if other lines are fine.
- The file performs no I/O and no arithmetic beyond the `toMinorUnits` conversion; keep it that way.
