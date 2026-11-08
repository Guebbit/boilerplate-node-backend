---
source: tests/unit/domain-primitives/money.property.test.ts
sha256: c368585823024d3441f09ce0c8141b76d4fa0abc41311dfbd985aa1a61a7b0a0
generated_at: 2026-11-08T10:04:25.184183+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/domain-primitives/money.property.test.ts

## Purpose

Property-based (fast-check) tests for the `Money` domain primitive. The file's core claim is that no monetary operation in the module can produce `NaN`, `Infinity`, or a fraction of a minor unit for *any* input. Arbitraries are deliberately hostile (booleans, strings, `null`, `Number.MAX_VALUE`) rather than realistic, so the tests pin totality. A fixed seed makes counterexamples reproducible; the run count is externalised via a knob.

## Key elements

- **`RUN`** — single source of truth for seed (`20_260_819`), `numRuns` (from `PROPERTY_RUNS`), and `endOnFailure: true`; shared by every `fc.assert` call.
- **`anything()`** — arbitrary that generates a wide mix of types (doubles, integers, strings, booleans, `null`, `undefined`, extreme magnitudes, `'1e400'`). Used for hostile-input totality checks.
- **`realisticPrice()`** — arbitrary for plausible catalogue prices (`0…1e6`, no NaN/Inf). Used for round-trip and arithmetic properties.
- **`asMoney(minorUnits)`** — local helper that casts a verified integer to the branded `Money` type; the module itself exposes no public constructor.
- **`money()`** — arbitrary that produces a `Money` value by round-tripping a random integer through `toMinorUnits`, used by `subtractMoney` and `apportion` tests.
- **`describe('toMinorUnits — totality')`** — asserts every output is finite + integer; junk maps to `NO_MONEY`; overflow saturates rather than producing `Infinity`.
- **`describe('toMinorUnits ↔ toDecimalString')`** — round-trip fidelity to the cent, regex pinning of decimal places, idempotency.
- **`describe("…each currency's own minor-unit exponent")`** — the file's actual subject: JPY (0 dp), KWD (3 dp), EUR (2 dp), unknown codes fall back to 2, ISO 4217 table is authoritative over CLDR/`Intl`, exponent is cached per currency.
- **`describe('toMinorUnits — decimal text')`** — digit-by-digit parsing (no float intermediary), half-up rounding with sign, exponent-notation handling.
- **`describe('fitsCurrency')`** — validation gate: accepts amounts within the currency's precision, rejects excess places and non-finite values; property that every `toDecimalString` output passes.
- **`describe('addMoney')`** — exactness, associativity, commutativity, empty-fold to `NO_MONEY`, finiteness under hostile terms.
- **`describe('scaleMoney')`** — agreement with repeated addition, zero-quantity → `NO_MONEY`, finiteness for any count.
- **`describe('wholeCount')`** — totality (always integer) and identity on genuine counts.
- **`describe('subtractMoney')`** / **`describe('apportion')`** / **`describe('scaleMoneyByRate')`** — (truncated in sample) exact integer subtraction, pro-rata splitting, and rate scaling with the same totality invariants.

## Relationships

- **`src/domain-primitives/money.ts`** — the module under test. Every import (`addMoney`, `apportion`, `fitsCurrency`, `minorUnitExponent`, `NO_MONEY`, `scaleMoney`, `scaleMoneyByRate`, `subtractMoney`, `toDecimalString`, `toMinorUnits`, `wholeCount`, `Money`) is exercised here. The tests pin behavioural contracts (totality, ISO 4217 exponent table, rounding mode) that the implementation must satisfy.
- **`tests/support/knobs.ts`** — provides `PROPERTY_RUNS`, the externalised iteration count for every `fc.assert` in this file. Changing it there adjusts coverage across all property test files without touching them.

## Notes

- The seed (`20_260_819`) is hard-coded in this file, not in the knob. If a failure reproduces, the comment at the top of the file says the counterexample should be written back as an ordinary `it()` block.
- `asMoney` is a test-local brand cast; it is not exported and must not be confused with a real `Money` constructor.
- The ISO 4217 `it.each` blocks explicitly assert that the pinned table overrides `Intl.NumberFormat` / CLDR display digits (e.g. HUF is 2 dp, not 0). If `Intl` changes or a new currency is added, these tests are the regression guard.
- The `anything()` arbitrary includes `'1e400'` and `Number.MAX_VALUE` specifically because `toMinorUnits` must saturate to `NO_MONEY` rather than let a finite-but-huge number overflow during scaling.
- The file is annotated with a reference to `docs/theory/tactical-ddd.md` §3, which presumably documents the "money as branded integer" decision.
