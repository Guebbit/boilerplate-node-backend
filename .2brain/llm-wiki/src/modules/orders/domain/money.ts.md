---
source: src/modules/orders/domain/money.ts
sha256: 822273296b8f26be4068927b4e445b28b80468aeccaa878b6f57612836c7a25d
generated_at: 2026-09-23T19:01:48.814428+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/money.ts

## Purpose

Defines the `Money` branded type and a small set of arithmetic helpers that perform all order-amount math in **integer minor units** (cents) rather than decimal floats. This eliminates floating-point drift in totals and makes results order-independent. It sits in the domain layer and is the single source of truth for amount representation within the orders module.

## Key elements

- **`Money`** (type) — `number & { readonly [MONEY_BRAND]: true }`. A compile-time brand over a plain integer; indistinguishable from `number` at runtime.
- **`NO_MONEY`** (const) — `0 as Money`; the identity element for `addMoney`.
- **`asMoney`** (internal) — Normalises a raw number to `Money`, coercing non-finite values and `-0` to `NO_MONEY`.
- **`toMinorUnits(value: unknown): Money`** — Boundary reader: converts a decimal `number` (or anything) to minor units via `Math.round(x * 100)`.
- **`toDecimalAmount(amount: Money): number`** — Boundary writer: the only way to leave the branded type.
- **`addMoney(...amounts): Money`** — Variadic integer sum.
- **`wholeCount(count: unknown): number`** — Coerces any input to a finite whole number (0 if unusable).
- **`scaleMoney(amount, count): Money`** — Unit price × whole quantity (exact integer multiply).
- **`subtractMoney(minuend, subtrahend): Money`** — Integer subtraction.
- **`scaleMoneyByRate(amount, rate): Money`** — Fractional share (e.g. VAT); the one place rounding is intentional (half-up to nearest minor unit).
- **`apportion(total, weights): Money[]`** — Pro-rata split of `total` across `weights` such that shares **exactly** sum to `total`; remainder goes to the largest weight. Returns all-zeros if every weight is zero.

## Relationships

- **`domain/tax.ts`** — Consumes `scaleMoneyByRate` to compute a VAT share of a gross or net amount.
- **`domain/totals.ts`** — Consumes `addMoney`, `subtractMoney`, `scaleMoney`, and `apportion` to build line totals, subtotals, and tax apportionment across order lines.
- **`tests/unit/money.property.test.ts`** — Property-based tests exercising the invariants of every exported helper (round-trip, identity, exact-sum guarantee of `apportion`, etc.).

## Notes

- `Money` is a **type-level brand only** (unique symbol). At runtime it is a plain `number`; `toDecimalAmount` is the sole exit. You cannot accidentally pass a raw `number` where `Money` is expected without an explicit `as Money` (which only `asMoney` performs internally).
- `scaleMoneyByRate` rounds **half-up toward +∞** (`Math.round(-0.5) === -0`). All current amounts are ≥ 0 (no refunds), so this is benign, but the doc comment flags it as a known asymmetry to revisit if credit notes introduce negative amounts.
- `apportion` distributes the rounding remainder to the **largest** weight (first on a tie). This is deliberate — do not "simplify" to first-index or proportional re-allocation without understanding the exact-sum invariant.
- All public functions that accept `unknown` (`toMinorUnits`, `wholeCount`, `scaleMoney`'s count param) are designed for raw aggregate output where a field may be absent or non-numeric.
