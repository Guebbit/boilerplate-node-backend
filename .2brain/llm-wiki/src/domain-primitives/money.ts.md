---
source: src/domain-primitives/money.ts
sha256: fec72b0a9ef495acdb36c0d0326adeabdf7e13c6ec3f350eda68b9f96df3fc14
generated_at: 2026-11-14T17:50:44.910558+00:00
model: ollama:qwen3.8:27b
---

# src/domain-primitives/money.ts

## Purpose

A zero-dependency domain primitive that represents monetary amounts as **whole integers of minor units** (never floats) and provides exact, order-independent arithmetic and string conversion. It pins the ISO 4217 minor-unit exponents in-repo so that every read, write, and display in the system agrees on a currency's scale without relying on the runtime's CLDR/`Intl` data. The `Money` type is a compile-time brand over `number`, not a class, so there is no runtime cost.

## Key elements

- **`Money`** (type) — `number & { [MONEY_BRAND]: true }`; a branded integer of minor units. Only `asMoney` (private) produces it.
- **`NO_MONEY`** — the zero identity (`0 as Money`), the fold point for `addMoney`.
- **`ISO_4217_EXPONENTS`** (private) — in-repo map of every supported ISO 4217 code to its decimal exponent (0, 2, 3, or 4). Sourced from SIX List One, pinned 2026-09-17.
- **`isIso4217Code`** — table-membership check; returns `false` for withdrawn or unknown codes.
- **`minorUnitExponent`** — looks up a code's exponent; defaults to **2** for any code not in the table.
- **`toMinorUnits(value, currency)`** — converts a raw decimal (number, `Decimal128` string, or any `unknown`) to minor units. Decimal strings are parsed digit-by-digit (no float); numbers are multiplied and rounded.
- **`toDecimalString(amount, currency)`** — renders minor units back to plain decimal text at exactly the currency's places (e.g. `"1000"` JPY, `"1.500"` KWD). Uses `BigInt` to avoid exponent notation for large values.
- **`padDecimal(value, currency)`** — round-trip: `toDecimalString(toMinorUnits(...))`; normalises any input to the canonical padded form.
- **`formatMoney(locale, amount, currency)`** — locale-aware display via `Intl.NumberFormat`, with `min/maxFractionDigits` driven by the pinned exponent so mail and ledger agree.
- **`fitsCurrency(amount, currency)`** — validation: returns `true` only when a plain-decimal string has no significant digits past the currency's places (trailing zeros are ignored).
- **`addMoney(...amounts)` / `subtractMoney(a, b)`** — exact integer addition/subtraction.
- **`scaleMoney(amount, count)`** — multiply by a whole count (non-finite → 0).
- **`averageMoney(amount, count)`** — `amount / count` rounded half-up; returns `NO_MONEY` if `count ≤ 0`.
- **`minMoney(first, ...rest)`** — smallest of a set of amounts.
- **`wholeCount(count)`** — coerces any `unknown` to a finite whole number (non-finite → 0).
- **Fractional-share function** (name truncated in source) — applies a fractional rate (e.g. a tax or credit percentage) to an amount, rounding half-up. The only place a multiply is intentionally fractional; described as distinct from `scaleMoney`.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** — the persistence layer that serialises/deserialises `Money` values to/from the database; calls `toMinorUnits` on read and `toDecimalString` on write.
- **`src/infrastructure/config/fields.ts`** — defines configuration schema fields whose values are `Money`; relies on `isIso4217Code` and `minorUnitExponent` for validation.
- **`src/modules/orders/domain/totals.ts`** — composes line items via `addMoney`, applies tax via the fractional-share function, and renders order totals with `toDecimalString`.
- **`src/modules/orders/domain/tax.ts`** — computes per-line tax amounts using the fractional-share function and `subtractMoney`.
- **`src/modules/orders/emails.ts`** — renders order-confirmation mail with `formatMoney`.
- **`src/modules/invoicing/domain/credit-shares.ts`** — splits a total across parties using `averageMoney` and the fractional-share function.
- **`src/modules/invoicing/presenter.ts`** — formats invoice line items and totals with `toDecimalString` / `formatMoney`.
- **`src/modules/invoicing/emails.ts`** — composes e-mail body text using `formatMoney`.
- **`src/modules/invoicing/services/stats.ts`** — aggregates historical amounts with `addMoney` and `averageMoney`.
- **`src/modules/cart/services/checkout.ts`** — sums cart lines (`addMoney`), applies delivery charge, and validates with `fitsCurrency` before placing the order.
- **`src/modules/cart/services/view.ts`** — renders cart display via `toDecimalString` / `formatMoney`.
- **`src/modules/delivery/domain/rates.ts`** — returns delivery charges as `Money`; uses `scaleMoney` and `minMoney` to cap or scale zone rates.
- **`src/modules/delivery/tests/unit/rates.test.ts`** / **`src/modules/delivery/tests/unit/rates.property.test.ts`** / **`src/modules/delivery/tests/unit/money-reconciliation.property.test.ts`** — unit and property-based tests that exercise `toMinorUnits`, `toDecimalString`, `addMoney`, and the rate-calculation path to confirm round-trip fidelity and reconciliation.

## Notes

- **Brand, not class.** `Money` is indistinguishable from `number` at runtime. Any code that casts a raw `number` to `Money` bypasses the `asMoney` guard (finite check, `-0` normalisation). Use the exported constructors, not raw casts.
- **Exponent source is the in-repo table, not `Intl`.** CLDR disagrees with ISO 4217 for at least 17 currencies (e.g. `IDR`, `HUF`, `IRR`). `formatMoney` still uses `Intl.NumberFormat` for *display*, but passes explicit `min/maxFractionDigits` from the pinned table to keep the scale correct.
- **`toDecimalString` uses `BigInt`.** `String(1e21)` would switch to exponent notation; `BigInt` keeps the full digit string intact. This matters for very large KRW/JPY amounts.
- **The fractional-share function rounds half-up, and `Math.round(-0.5) === -0`.** All current callers pass non-negative amounts, so this is a non-issue today; the source comment flags it for the day a negative share is needed.
- **`minorUnitExponent` defaults to 2 for unknown codes.** Use `isIso4217Code` first if you need to *reject* unlisted codes (e.g. in validation); `minorUnitExponent` alone will silently accept anything.
- **`fitsCurrency` ignores trailing zeros** past the exponent (`"19.990"` EUR is valid). It does not reject exponent-notation strings (`"1e2"`).
