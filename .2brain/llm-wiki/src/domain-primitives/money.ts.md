---
source: src/domain-primitives/money.ts
sha256: 2689c8684ba436bbeb3909fcaca4d82b1682dd4f9084f68b44d995373bbe76bc
generated_at: 2026-11-08T03:15:39.573286+00:00
model: ollama:qwen3.8:27b
---

# src/domain-primitives/money.ts

## Purpose

Defines the `Money` type and its full arithmetic/formatting toolkit. All monetary values in the system are stored and manipulated as **whole integers of minor units** (never floats), with conversion to/from decimal strings handled by digit-shifting rather than multiplication, so totals stay exact and order-independent. The file also pins the ISO 4217 exponent table in-repo so currency scaling never depends on the runtime's CLDR data.

## Key elements

- **`Money`** — branded `number` type (via `unique symbol`); a compile-time tag, no runtime cost.
- **`NO_MONEY`** — canonical zero; identity for `addMoney`.
- **`asMoney`** (private) — normalises non-finite and `-0` inputs to `NO_MONEY`; the sole constructor.
- **`ISO_4217_EXPONENTS`** (private) — pinned `Record<currency-code, exponent>` covering 0-, 3-, 4-, and 2-decimal currencies.
- **`minorUnitExponent(currency)`** — looks up (or defaults to 2) a currency's decimal places.
- **`toMinorUnits(value, currency)`** — converts a decimal string/number to minor units; reads `Decimal128`-style text digit-by-digit to avoid float intermediates.
- **`toDecimalString(amount, currency)`** — converts minor units back to a padded decimal string; uses `BigInt` to prevent exponent notation on large values.
- **`padDecimal(value, currency)`** — round-trips a raw value through `toMinorUnits` → `toDecimalString` to normalise trailing zeros.
- **`formatMoney(locale, amount, currency)`** — locale-aware display (e.g. `€19.99`) using `Intl.NumberFormat` with the pinned exponent.
- **`fitsCurrency(amount, currency)`** — validates that a decimal string has no value past the currency's minor unit.
- **`addMoney`, `subtractMoney`, `minMoney`** — exact integer arithmetic over `Money`.
- **`scaleMoney(amount, count)`** — multiply by a whole quantity (line price × qty).
- **`averageMoney(amount, count)`** — divide by a positive count, rounded half-up; returns `NO_MONEY` for zero/negative count.
- **`scaleMoneyByRate(amount, rate)`** — multiply by a fractional rate (e.g. VAT 0.22); the *only* place VAT arithmetic rounds.
- **`splitMoney(total, weights)`** (truncated in source) — pro-rata split that guarantees parts sum exactly to `total`; floors each share then distributes the remainder to the largest weights.
- **`wholeCount(count)`** — normalises an arbitrary input to a finite whole number (default 0).

## Relationships

- **`infrastructure/persistence/money-field.ts`** — persistence layer that reads/writes `Money` as a `Decimal128` column; `toMinorUnits`/`toDecimalString` are the conversion boundary between the DB representation and the in-memory integer.
- **`modules/orders/domain/totals.ts`** — composes `addMoney`, `scaleMoney`, `subtractMoney` to build line and order totals.
- **`modules/orders/domain/tax.ts`** — calls `scaleMoneyByRate` to compute VAT on gross/net amounts.
- **`modules/orders/emails.ts`** / **`modules/invoicing/emails.ts`** — use `formatMoney` to render human-readable amounts in outbound mail.
- **`modules/invoicing/domain/credit-shares.ts`** — uses `splitMoney` to allocate a credit pro-rata across order lines.
- **`modules/invoicing/presenter.ts`** — formats invoice line items and totals via `toDecimalString` / `formatMoney`.
- **`modules/invoicing/services/stats.ts`** / **`modules/orders/services/stats.ts`** — call `averageMoney` for aggregate reporting.
- **`modules/delivery/domain/rates.ts`** — represents delivery fees as `Money`; uses `addMoney` and `scaleMoney` when composing charges.
- **`modules/cart/services/checkout.ts`** — resolves cart totals into `Money` before handing off to orders/invoicing.
- **`modules/cart/services/view.ts`** — reads cart line amounts as `Money` for display.
- **`modules/delivery/tests/unit/money-reconciliation.property.test.ts`** — property-based tests asserting `splitMoney` parts always sum to the total.
- **`modules/delivery/tests/unit/rates.property.test.ts`** / **`rates.test.ts`** — exercise `Money` arithmetic in delivery-rate scenarios.

## Notes

- **Never a float.** `Money` is an integer of minor units at runtime. The only floating-point path is `scaleMoneyByRate`, which immediately rounds.
- **ISO 4217, not CLDR.** The exponent table is hard-coded in the repo. The file's doc comment lists at least 18 currencies where `Intl`/CLDR reports 0 decimals but ISO 4217 says 2 (e.g. AFN, COP, HUF, IDR). Relying on the runtime table would silently mis-scale those currencies.
- **`-0` is eliminated.** `asMoney` maps any zero-magnitude input to `+0`, so `toDecimalString` never emits `"-0"`.
- **Half-up rounding direction.** `Math.round` in JS rounds `-0.5` toward +∞ (i.e. `-0`). The file notes this is harmless while all amounts are ≥ 0, but flags it as a revisit point if credit notes ever produce negative shares.
- **`BigInt` in `toDecimalString`.** Used only to get a full-precision decimal string for large doubles (`1e21`); the arithmetic itself still operates on the integer `Money` value.
- **`splitMoney` exactness guarantee.** Unlike naive `total / weights.length`, this function floors every share first, then hands out the leftover minor units to the largest weights so the parts always sum to the original total.
