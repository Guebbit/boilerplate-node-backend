---
source: src/modules/cart/presenter.ts
sha256: a93be0021fe3bdf2dbc39421b74471c4ab4c36375401d857c259fa77ec4adc49
generated_at: 2026-11-08T05:15:22.273556+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/presenter.ts

## Purpose

Pure mapping layer that takes already-computed cart facts (lines, totals, shipping) and shapes them into the `CartResponse` the OpenAPI contract requires. It exists so that the "what goes on the wire" logic — including derived flags like `canIncrease` and `checkoutable` — lives in one testable, side-effect-free function rather than being scattered across services.

## Key elements

- **`CartView`** — Type alias for `CartResponse`; documents that this module speaks the contract's vocabulary.
- **`JudgedCartLine`** — A cart line annotated with its `LineAvailability` verdict; the unit the presenter iterates over.
- **`CartFacts`** — The input contract: pre-computed lines, counts, monetary totals (as decimal strings), shipping block, and the shop's per-line ceiling (`lineMax`).
- **`presentCart(facts: CartFacts): CartView`** — The sole exported function. Maps each line to `{ productId, quantity, availability, canIncrease }` (where `canIncrease = quantity < lineMax`), assembles the `summary` block, passes `shipping` through, and computes `checkoutable` as "at least one line exists **and** every line passes `isBuyable`."

## Relationships

- **`src/modules/cart/domain/index.ts`** (→ `availability.ts`) — Provides the `isBuyable` predicate used for the `checkoutable` flag.
- **`src/modules/cart/services/view.ts`** — The caller: reads lines, ledger, and shipping options, runs the domain rules, then hands the assembled `CartFacts` to `presentCart`.
- **`src/modules/cart/services/items.ts`** — Produces the line/quantity/gross-total figures that appear in `CartFacts` (see `sumLineItems` referenced in JSDoc).
- **`src/types/index.ts`** — Source of the `CartResponse`, `CartShipping`, and `LineAvailability` types imported here.
- **`src/modules/cart/index.ts`** — Public barrel; re-exports this module's surface for consumers outside the cart feature.

## Notes

- All monetary values are **decimal strings**, not numbers — do not perform arithmetic here; the services already did that.
- `canIncrease` is intentionally derived at presentation time (from `lineMax`) so the wire carries a ready-to-use boolean instead of expecting the client to re-derive it.
- `checkoutable` is **false** when the cart is empty *or* any single line is not buyable — it is an all-or-nothing gate, not a partial indicator.
- The function is pure and returns a fresh object each call; there is no mutation or caching.
