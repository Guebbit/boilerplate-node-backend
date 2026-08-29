# src/modules/orders/domain/money.ts

## Purpose

A branded-type money representation for the orders domain. All monetary arithmetic runs in integer minor units (cents) so totals are exact and order-independent; the single conversion to/from the `number`/`double` shape required by `openapi.yaml` is isolated in this file. It is a type + function module, not a class.

## Key elements

- **`Money`** — `number & { readonly [MONEY_BRAND]: true }`. A brand over `number`; same value at runtime, distinct type at compile time. The only path back to a plain `number` is `toDecimalAmount`.
- **`NO_MONEY`** — `0 as Money`. Identity element for `addMoney` and the fallback for non-finite results.
- **`asMoney`** (private) — The sole constructor. Coerces non-finite values (`Infinity`, `NaN`) to `0` and normalises `-0` to `0`. Every public function funnels through this.
- **`toMinorUnits(value: unknown): Money`** — Entry point. Reads a decimal `number` (or anything else) and converts to minor units via `Math.round(Number(value) * 100)`. Accepts `unknown` because callers may pass raw aggregate output or missing fields; junk becomes `0`.
- **`toDecimalAmount(amount: Money): number`** — The only exit. Returns `amount / 100`, at most two decimal places.
- **`addMoney(...amounts: readonly Money[]): Money`** — Variadic integer addition, exact regardless of term count.
- **`wholeCount(count: unknown): number`** — Parses and rounds to a whole number; returns `0` for non-finite input. Exported so `totals.ts` can use the same count for both the quantity and the price columns.
- **`scaleMoney(amount: Money, count: unknown): Money`** — Multiplies a unit amount by a whole count (line price × quantity). Fractional quantities are not supported by design.

## Relationships

- **`src/modules/orders/domain/totals.ts`** — Primary consumer. Calls `toMinorUnits`, `addMoney`, `scaleMoney`, and `wholeCount` to compute line-item and order totals; uses `wholeCount` for both the count and the price column so the two cannot describe different baskets.
- **`src/modules/orders/tests/unit/money.property.test.ts`** — Property-based tests that exercise the invariants (finiteness, exactness, identity, rounding boundaries) of every exported function.
- **`docs/theory/tactical-ddd.md` §3** — Design rationale: why a branded integer in minor units is the chosen boundary-representation strategy for the orders domain.

## Notes

- Every public function accepts `unknown` (or `Money`) and returns `Money`/`number`. There is no `try/catch`; non-finite or garbage input silently becomes `0`. This is intentional: "junk is worth nothing."
- `-0` is normalised to `0` inside `asMoney`. If you ever see a negative zero in a log, it was introduced outside this module.
- `scaleMoney` does **not** support fractional quantities (e.g., weight-based pricing). A different function would be needed for that use case.
- The brand symbol (`MONEY_BRAND`) is declared but not exported; only the `Money` type alias is part of the public surface.
- Rounding happens at conversion boundaries (`toMinorUnits`, `wholeCount`), not at each addition site. This is the stated reason the module exists as a single file rather than inlining `Math.round` at every call.
