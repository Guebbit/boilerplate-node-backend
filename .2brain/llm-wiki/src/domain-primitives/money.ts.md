---
source: src/domain-primitives/money.ts
sha256: dfc7d4934a51e9fbbaa720d8741d295267f25faf09d8dedacbb77da8ca89f1dd
generated_at: 2026-10-29T01:52:06.729629+00:00
model: ollama:qwen3.8:27b
---

# src/domain-primitives/money.ts

## Purpose

A domain primitive that represents monetary amounts as **whole integers of minor units** (not floats) and provides exact, order-independent arithmetic on them. It exists so that every module shares a single, compiler-enforced `Money` brand, a pinned ISO 4217 exponent table, and a small set of arithmetic helpers that never introduce floating-point drift — eliminating the class of "off-by-a-cent" bugs that arise from ad-hoc `* 100` / `/ 100` arithmetic scattered across the codebase.

## Key elements

- **`Money`** (type) — branded `number`; identical at runtime, distinct at compile time. The only way back out is `toDecimalAmount`.
- **`NO_MONEY`** — the zero-amount identity for `addMoney` folds.
- **`minorUnitExponent(currency)`** — looks up a currency's decimal places from the pinned `ISO_4217_EXPONENTS` table (defaults to 2).
- **`toMinorUnits(value, currency)`** — converts a raw decimal (`number`, `Decimal128` string, or `unknown`) to minor units. Reads digit-by-digit for text values; multiplies-and-rounds for plain numbers.
- **`toDecimalAmount(amount, currency)`** — the inverse; returns the decimal `number` the API contract publishes.
- **`formatMoney(locale, amount, currency)`** — locale-aware currency string using the pinned exponent (not `Intl`'s CLDR data).
- **`fitsCurrency(amount, currency)`** — round-trip check that a decimal amount has no more places than the currency allows.
- **`addMoney`, `subtractMoney`** — exact integer addition/subtraction.
- **`minMoney`** — smallest of a set (used as a refund cap).
- **`scaleMoney(amount, count)`** — multiply by a whole count (line price × qty).
- **`scaleMoneyByRate(amount, rate)`** — multiply by a fractional rate (e.g. VAT); the one place that rounds.
- **`averageMoney(amount, count)`** — total ÷ count, rounded; returns `NO_MONEY` for zero/negative count.
- **`apportion(total, weights)`** — pro-rata split that guarantees parts sum **exactly** to `total`; leftover units go to the largest weight.
- **`wholeCount(count)`** — safe integer parse of an arbitrary `unknown` quantity.

## Relationships

- **`orders/domain/totals.ts`** — consumes `addMoney`, `subtractMoney`, `scaleMoney`, and `apportion` to build order line totals, apply discounts, and split shipping/tax across lines.
- **`orders/domain/tax.ts`** — uses `scaleMoneyByRate` to compute VAT and `addMoney`/`subtractMoney` to reconcile gross/net figures.
- **`invoicing/domain/credit-shares.ts`** — calls `apportion` to split a credit note pro-rata across order lines and `minMoney` to cap individual shares.
- **`cart/services/checkout.ts`** — calls `toMinorUnits` on incoming decimal prices and `addMoney`/`scaleMoney` to build the cart total before persisting.
- **`cart/presenter.ts`** — calls `formatMoney` and `toDecimalAmount` to render human-readable amounts in the cart UI.
- **`payments/domain/lifecycle.ts`**, **`disputes.ts`**, **`display-status.ts`** — use `Money` as the type for payment/dispute amounts; call `toDecimalAmount` for the API contract and `minMoney` for refund caps.
- **`orders/emails.ts`**, **`invoicing/emails.ts`**, **`payments/emails.ts`** — call `formatMoney` to render amounts in transactional email templates.
- **`orders/services/stats.ts`**, **`invoicing/services/stats.ts`** — use `averageMoney` for average-order-value and average-invoice metrics.
- **`delivery/tests/unit/rates.test.ts`** — exercises `scaleMoneyByRate` and `toMinorUnits`/`toDecimalAmount` with multi-decimal currencies.
- **`orders/tests/integration/repository.test.ts`** — round-trips amounts through `toMinorUnits` → store → `toDecimalAmount` to verify persistence fidelity.

## Notes

- **Pinned exponents, not `Intl`.** The `ISO_4217_EXPONENTS` table deliberately diverges from the runtime's CLDR data (e.g. `Intl` says 0 decimals for HUF, IDR, COP, PKR, LBP, IQD; ISO 4217 says 2 or 3). If you need to add a currency, edit the table here — do not fall back to `Intl.NumberFormat` for the exponent.
- **`Money` is a brand, not a class.** There is no constructor; `asMoney` (private) is the only entry point and normalises `-0` and non-finite values to `NO_MONEY`. You cannot accidentally create an unbranded amount.
- **`scaleMoneyByRate` is the single rounding point for fractional math.** `scaleMoney` (whole-count) is exact; `scaleMoneyByRate` (e.g. 22 % VAT) rounds half-up. All other functions are integer-exact.
- **`Math.round` rounds toward +∞ for negatives** (`Math.round(-0.5) === 0`). The codebase currently has no negative amounts (`min: 0`), so this is harmless, but the doc comment flags it as a revisit item if credit notes ever carry negative shares.
- **`apportion` is deterministic on ties** — the first (lowest-index) largest weight absorbs the remainder.
- **`toMinorUnits` accepts `unknown`.** Callers feed it raw aggregate output where a field may be absent; the function degrades to `0` rather than throwing.
- **`formatMoney` takes a decimal `number`, not a `Money`.** You must call `toDecimalAmount` first; passing a minor-unit integer directly will produce a grossly inflated display value.
