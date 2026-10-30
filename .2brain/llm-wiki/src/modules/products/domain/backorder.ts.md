---
source: src/modules/products/domain/backorder.ts
sha256: 93ec19e77ba206fa97f4df4c2f3531ef922d29e3f3f319d08cfa0e29d645cada
generated_at: 2026-10-29T05:25:34.787389+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/backorder.ts

## Purpose

Defines the backorder eligibility rule for RELEASED products whose shelf is empty. Exposes a single pure predicate (`isBackorder`) that, given a product's backorder fields and a clock, answers whether an order may be placed against the backorder cap. The clock is a parameter, not a side effect, so every branch is unit-testable without waiting.

## Key elements

- **`BackorderFacts`** — Interface extending `PreorderFacts` (from `./preorder`). Adds four optional fields the rule reads: `allowBackorder` (on/off switch), `restockDate` (future = open, past = sold out), `backorderLimit` (cap; `null` = uncapped, absent = closed), `backordered` (units already owed).
- **`isBackorder(facts, now): boolean`** — The sole exported function. Returns `true` only when *all* of the following hold:
  1. `allowBackorder === true`
  2. `active !== false`
  3. `purchasable !== false`
  4. Product is **not** a preorder (`isPreorder` is false)
  5. `restockDate` is absent or still in the future
  6. `preorderAllowanceLeft(backorderLimit, backordered) > 0`

## Relationships

- **`./stock`** — Imports `preorderAllowanceLeft` to compute remaining capacity against the cap.
- **`./preorder`** — Imports `isPreorder` (to exclude preorders) and the `PreorderFacts` base type (which supplies `active` and `purchasable`).
- **`./index.ts`** — Barrel file; re-exports this module's public API for consumers.
- **`tests/unit/backorder.test.ts`** — Unit tests exercising every branch of `isBackorder`.

## Notes

- A **missed** `restockDate` (i.e. `restockDate ≤ now`) is treated as "sold out" by design: it signals staff have not updated the date, so the shop has no basis to promise fulfillment.
- `backorderLimit` of `null` means *no cap* (unlimited backorder), while `undefined` means the cap is *closed* (zero allowance). These are intentionally distinct.
- The function does **not** check current shelf stock; the cart/line-level logic decides how much spills onto backorder.
- All "off" / "closed" defaults are encoded as *absence* (`undefined`), not as explicit `false`/`0`, so consumers can omit fields they don't set.
