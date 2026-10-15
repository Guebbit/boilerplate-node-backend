---
source: src/shared-kernel/money.ts
sha256: 4cff645d4f71683bd6d6d84573e0392b2836cc50dce469588a44cfda5ba1fbc2
generated_at: 2026-10-15T12:29:21.987294+00:00
model: ollama:qwen3.8:27b
---

# src/shared-kernel/money.ts

## Purpose

Provides a branded `Money` type (integer minor units, never a float) plus the full arithmetic and conversion toolkit for a multi-currency system. All internal arithmetic stays in exact integers; decimal `number` values appear only at the API boundary. The file pins ISO 4217 minor-unit exponents in-repo so that zero-decimal (JPY, KRW), three-decimal (KWD, BHD), and four-decimal (CLF, UYW) currencies are handled correctly without relying on `Intl`.

## Key elements

- **`Money`** — `number & { [MONEY_BRAND]: true }`. A type-level brand, not a runtime class. The only way back to a decimal is `toDecimalAmount`.
- **`NO_MONEY`** — `0 as Money`, the additive identity and the sentinel for "nothing owed."
- **`minorUnitExponent(currency)`** — looks up a currency's decimal places from the pinned `ISO_4217_EXPONENTS` table; defaults to 2.
- **`toMinorUnits(value, currency)`** — the single constructor. Parses `Decimal128`/plain-decimal strings digit-by-digit (no float multiply); falls back to `Math.round(value * 10**exp)` for raw numbers. Normalises `-0` and non-finite values to `NO_MONEY`.
- **`toDecimalAmount(amount, currency)`** — the single deconstructor back to a decimal `number`.
- **`fitsCurrency(amount, currency)`** — round-trip validation: `true` iff the decimal survives a minor-unit round-trip unchanged.
- **`addMoney(...amounts)`** — variadic exact integer sum.
- **`subtractMoney(minuend, subtrahend)`** — exact integer difference.
- **`scaleMoney(amount, count)`** — multiply by a whole count (line-item total).
- **`scaleMoneyByRate(amount, rate)`** — multiply by a fractional rate (tax); the one place rounding is applied.
- **`averageMoney(amount, count)`** — `amount / count` rounded half-up; returns `NO_MONEY` when `count ≤ 0`.
- **`apportion(total, weights)`** — pro-rata split guaranteeing the shares sum exactly to `total`. Flooring first, then assigning the remainder to the largest weight. Returns all-zero shares if all weights are zero.
- **`wholeCount(count)`** — coerces an `unknown` to a safe whole number (0 for non-finite).

## Relationships

- **`orders/domain/totals.ts`** — consumes `addMoney`, `scaleMoney` to compute line and order totals.
- **`orders/domain/tax.ts`** — uses `scaleMoneyByRate` to apply VAT/GST to a gross or net figure.
- **`invoicing/domain/credit-shares.ts`** — calls `apportion` to split a credit pro-rata across order lines.
- **`payments/services/refunds.ts`** — uses `subtractMoney` when reducing a settled amount.
- **`payments/services/settlement.ts`** — composes `addMoney` / `subtractMoney` to compute net settlement.
- **`payments/domain/display-status.ts`**, **`payments/services/notify.ts`** — call `toDecimalAmount` to produce the decimal value shown to users or sent in notifications.
- **`orders/services/stats.ts`**, **`invoicing/services/stats.ts`**, **`payments/services/stats.ts`** — use `averageMoney` for average-value metrics.
- **`products/model.ts`** — stores unit prices as `Money`; `toMinorUnits` / `toDecimalAmount` at the persistence boundary.
- **`returns/domain/accounting.ts`** — uses `subtractMoney` and `apportion` for return-cost allocation.
- **`modules/cart/services/checkout.ts`** — aggregates line totals via `addMoney` before handing off to orders/payments.
- **Test files** (`delivery/tests/unit/rates.test.ts`, `orders/tests/integration/repository.test.ts`) — exercise the conversion and arithmetic paths with edge-case currencies and boundary values.

## Notes

- **Brand, not class.** `Money` is the same `number` at runtime. You cannot `instanceof`-check it; the compiler enforces the boundary. `toDecimalAmount` is the *only* sanctioned way to get a float back.
- **ISO 4217 table is pinned, not looked up.** The file deliberately does not use `Intl.NumberFormat` or CLDR because those sources disagree with ISO 4217 for HUF, IDR, COP, PKR, LBP, IQD. If a new currency is added, it must be added to `ISO_4217_EXPONENTS` or it silently gets exponent 2.
- **Text parsing avoids float.** `Decimal128` and plain-decimal strings go through `minorUnitsOfText`, which manipulates digit strings. Only raw `number` inputs hit the `Math.round(x * 10**exp)` path.
- **Rounding in `scaleMoneyByRate` is half-up toward +∞** (`Math.round(-0.5) === 0`). The file notes this is harmless while all amounts are `min: 0`; it would need revisiting if negative credit-note shares are introduced.
- **`apportion` assigns the remainder to the largest weight** (first on a tie). All-zero weights short-circuit to all-zero shares rather than dividing by zero.
- **`toMinorUnits` accepts `unknown`.** Callers may pass `null`/`undefined` from unpopulated aggregate fields; the function degrades to `NO_MONEY` rather than throwing.
- **`NO_MONEY` is `0`**, not `-0`. `asMoney` explicitly normalises `-0 → 0`.
