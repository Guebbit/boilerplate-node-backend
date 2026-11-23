---
source: src/domain-primitives/money.ts
source_sha256: c40672af6cca65875a9729fa22c34a4a901203e297288d2541d51546d67cc256
context_sha256: 3bdacc8716465bca6cf7ce4470afce2b32980008e509dea8a40fbea61ada18c8
generated_at: 2026-11-22T02:32:55.869712+00:00
model: claude-code:claude-sonnet-5-5
---

# src/domain-primitives/money.ts

## Purpose
Defines `Money`, a branded integer type holding an amount in a currency's minor units, plus the helpers that convert it to and from decimal strings and do arithmetic on it. Keeping amounts as integers between the boundaries makes totals exact and order-independent. Decimal strings appear only on the contract/wire side, at the currency's own number of places.

## Key elements
- **`Money`**: `number & { brand }`. The brand exists only at compile time; at runtime it is a plain number. `toDecimalString` is the intended way back out.
- **`NO_MONEY`**: zero, the identity for `addMoney`.
- **`asMoney`** (private): the single constructor. It maps non-finite values and `-0` to `0`.
- **`ISO_4217_EXPONENTS`** (private): a pinned in-repo table of minor-unit exponents. Most currencies are 2; 0 covers JPY, KRW and similar; 3 covers KWD, BHD and similar; 4 covers CLF and UYW.
- **`isIso4217Code(code)`**: table-membership check. It rejects withdrawn codes.
- **`minorUnitExponent(currency)`**: returns the exponent from the table, falling back to 2 for unlisted codes.
- **`toMinorUnits(value, currency)`**: reads `unknown` input into minor units.
  - Plain decimal text (a string or `Decimal128`) is parsed by moving digits, with no float involved. Extra digits round half-up on the first dropped digit.
  - A `number` is multiplied by 10^exponent and rounded.
- **`toDecimalString(amount, currency)`**: formats minor units as padded decimal text (`"19.90"`, `"1000"` for JPY, `"1.500"` for KWD). It uses `BigInt` to avoid exponent notation.
- **`padDecimal(value, currency)`**: re-pads any amount to the currency's places by round-tripping through `toMinorUnits` and `toDecimalString`.
- **`formatMoney(locale, amount, currency)`**: `Intl.NumberFormat` currency formatting, with the fraction digits forced to the pinned exponent.
- **`fitsCurrency(amount, currency)`**: true if the text is plain decimal with no non-zero digits past the currency's places. It keeps stored amounts equal to charged amounts.
- **Arithmetic**:
  - `addMoney(...amounts)`: variadic integer sum.
  - `subtractMoney(a, b)`: integer difference.
  - `minMoney(first, ...rest)`: the smallest amount.
  - `scaleMoney(amount, count)`: multiply by a whole count, coerced by `wholeCount`.
  - `averageMoney(amount, count)`: half-up rounded share; returns `NO_MONEY` if `count <= 0`.
  - `scaleMoneyByRate(amount, rate)`: the one place a fractional rate is applied, rounded half-up.
- **`wholeCount(count)`**: coerces anything to a finite rounded integer, or 0.

## Relationships
The neighbor list gives dependency-graph edges only. The visible file imports nothing, so it is a leaf primitive, and the neighbors are presumably its consumers. The visible code shows no direct interaction with any of them.

- `formatMoney` and `padDecimal` are plausibly used by presentation neighbors such as `src/modules/invoicing/emails.ts` and `src/modules/invoicing/presenter.ts`. The source comments mention mails and the ledger agreeing on scale, but no file is named.
- `src/infrastructure/persistence/money-field.ts` is presumably the persistence side. The comments mention stored `Decimal128` values and raw aggregate output as inputs to `toMinorUnits`.
- `src/infrastructure/config/fields.ts` may use the currency-code check or `fitsCurrency`. This is not confirmed by the file.
- The orders, cart, delivery and invoicing domain and service files, and the delivery property tests, sit in the graph as neighbors. They presumably use the arithmetic helpers, but nothing visible here confirms specific calls.
- A comment says `formatMoney`'s input is numeric because of the `DecimalAmount` pattern in the OpenAPI contract, so the contract defines the decimal-string format that `formatMoney` assumes.

## Notes
- The exponent table is deliberately pinned to ISO 4217 rather than `Intl`/CLDR. CLDR reports 0 places for several currencies where ISO says 2, such as HUF, COP and IDR.
- `minorUnitExponent` silently returns 2 for unknown codes. Use `isIso4217Code` when validation is needed.
- `toMinorUnits` parses only plain decimal text. Exponent notation or junk falls to the numeric path, and non-numeric junk becomes `NO_MONEY` via `asMoney`.
- `scaleMoneyByRate` and `averageMoney` use `Math.round`, which rounds negative halves toward +∞. The source says this is harmless today because the amounts passed in are non-negative, and it flags the issue for revisiting if negative shares are ever needed.
- Rounding appears only in `toMinorUnits` and in the rate and average helpers. Addition, subtraction and `scaleMoney` are exact.
- The table's header comment cites "SIX List One, published 2026-09-17".
- `formatMoney` casts its input to the template type `${number}`. Callers must pass a numeric amount.
