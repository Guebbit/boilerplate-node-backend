# src/modules/orders/domain/money.ts

## Purpose

Defines a compile-time-branded `Money` type (whole minor units) plus the small set of integer arithmetic operations the orders domain needs. It exists to keep order totals exact and order-independent by doing all math in integers, converting to/from the contract's decimal `number` only at the boundaries.

## Key elements

- **`Money`** — `number & { readonly [MONEY_BRAND]: true }`; a brand, not a class. Same integer at runtime, distinct type at compile time.
- **`NO_MONEY`** — `0 as Money`; the identity element for `addMoney`.
- **`asMoney`** (private) — the sole constructor. Coerces non-finite values and `-0` to `NO_MONEY`.
- **`toMinorUnits(value: unknown)`** — entry point from the outside. Multiplies by 100, rounds, returns `Money`. Accepts `unknown` because callers receive raw aggregate output that may carry no number.
- **`toDecimalAmount(amount: Money)`** — the only way back out to the contract's decimal `number` (at most two places).
- **`addMoney(...amounts: readonly Money[])`** — variadic integer addition with a running sum; no float drift.
- **`wholeCount(count: unknown)`** — parses an untrusted quantity to a finite whole number, defaulting to 0.
- **`scaleMoney(amount: Money, count: unknown)`** — multiplies a unit amount by a whole count (line price × quantity).

## Relationships

- **`src/modules/orders/domain/totals.ts`** — consumes `addMoney`, `scaleMoney`, `toMinorUnits`, and `toDecimalAmount` to compute order-level totals from per-line amounts and quantities.
- **`src/modules/orders/tests/unit/money.property.test.ts`** — property-based tests that exercise the invariants (e.g. `addMoney` associativity, `toMinorUnits`/`toDecimalAmount` round-tripping, non-finite handling).

## Notes

- The brand is a `unique symbol` (`MONEY_BRAND`), so `Money` is structurally identical to `number` at runtime but the compiler enforces you go through `toDecimalAmount` to leave the domain.
- `asMoney` is deliberately the only path into the type; all exported constructors funnel through it to normalise edge cases (`-0`, `NaN`, `Infinity`).
- `toMinorUnits` and `wholeCount` both accept `unknown` on purpose — the contract boundary can hand back `null`, `undefined`, or strings, and the module must survive that without throwing.
- See `docs/theory/tactical-ddd.md` §3 for the design rationale behind the integer-minor-units approach.
