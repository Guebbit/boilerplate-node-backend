---
source: tests/unit/shared-kernel/money.property.test.ts
sha256: b69cef77a209b9dede1e94ce8c536742a1633513422589dc45522bc2201bda34
generated_at: 2026-10-15T13:32:52.297539+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/shared-kernel/money.property.test.ts

## Purpose

Property-based tests for the `Money` module that verify—via hostile, non-realistic arbitraries—that no monetary function can ever produce `NaN`, `Infinity`, or a fraction of a minor unit. The file's central subject is the per-currency minor-unit exponent (JPY 0, EUR 2, KWD 3, etc.), since a wrong exponent silently corrupts every downstream calculation. All property assertions are seeded for reproducible counterexamples.

## Key elements

- **`RUN`** — shared `fc` config object: seed `20_260_819`, `numRuns` from `PROPERTY_RUNS`, `endOnFailure: true`. Single place to adjust run count or seed.
- **`asMoney(minorUnits)`** — casts a raw integer to the `Money` brand; the module never exposes a public constructor, so tests use this hand-verified bypass.
- **`anything()`** — arbitrary generator mixing `double`, `integer`, `string`, `boolean`, `null`, `undefined`, `Number.MAX_VALUE`, `'1e400'`, etc. Models "what a hostile client can send."
- **`realisticPrice()`** — finite non-negative double up to 1e6; the "normal" half of the input space.
- **`toMinorUnits` tests** — totality (finite integer for any input), junk → `NO_MONEY`, overflow → `NO_MONEY`, decimal-text parsing (digit-by-digit, no float intermediary), half-up rounding, exponent-notation passthrough.
- **`toDecimalAmount` round-trip tests** — round-trips a realistic price to the cent; never exceeds two decimals for EUR; idempotent.
- **Currency-exponent `describe` block** — JPY (0 dp), KWD (3 dp), mixed-currency disambiguation (`asMoney(1990)` decodes differently per currency), exponent caching, fallback for unknown codes, ISO 4217 table checks (HUF, IDR, COP, PKR, LBP, IQD, ISK, BHD, CLF).
- **`fitsCurrency` tests** — accepts amounts within the currency's precision; rejects extra decimals and non-finite values; every value that came out of minor units must fit.
- **`addMoney` tests** — associativity, order-independence, identity with `NO_MONEY`, empty-fold to `NO_MONEY`, finiteness under hostile terms.
- **`scaleMoney` tests** — agreement with repeated addition, zero-quantity → `NO_MONEY`, finiteness for any count.
- **`wholeCount` tests** — finite integer for any input; leaves genuine counts unchanged.
- **`subtractMoney` tests** — exact integer subtraction (truncated in the file shown).
- **`apportion` / `scaleMoneyByRate`** — imported and tested further down in the (truncated) file.

## Relationships

- **`src/shared-kernel/money.ts`** — the module under test. Every function and constant exercised in this file (`addMoney`, `subtractMoney`, `scaleMoney`, `scaleMoneyByRate`, `apportion`, `toMinorUnits`, `toDecimalAmount`, `fitsCurrency`, `wholeCount`, `minorUnitExponent`, `NO_MONEY`, `Money` type) is imported from here. The tests encode the module's invariants as executable contracts.
- **`tests/support/knobs.ts`** — supplies `PROPERTY_RUNS`, the single knob controlling how many times every `fc.assert` in this file runs. Changing that one value changes test throughput across all property-based suites.

## Notes

- The seed (`20_260_819`) is intentional: a failing run is reproducible, and the file's docblock states that any counterexample should be "written back as an ordinary `it()`."
- `Money` is a **brand type** with no public constructor; `asMoney` is the only way to fabricate values in tests. Do not add a real `new Money(...)` call to production code.
- Decimal-string tests (`'0.30'`, `'1234567890123.45'`) exist specifically to prove the implementation parses digits without routing through `parseFloat`/`Number()`, avoiding the classic `0.1 + 0.2 ≠ 0.3` pitfall.
- The ISO 4217 table checks are explicitly contrasted with `Intl.NumberFormat` (CLDR) display digits: HUF, IDR, COP, PKR, LBP, IQD all report 0 decimal places in CLDR but are 2 or 3 in ISO 4217. The module follows ISO, not CLDR.
- `fitsCurrency` is the gatekeeper: any value produced by `toDecimalAmount` must satisfy it. If a new currency is added, both the exponent table and a `fitsCurrency` case should be extended.
