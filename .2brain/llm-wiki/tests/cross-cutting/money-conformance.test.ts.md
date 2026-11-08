---
source: tests/cross-cutting/money-conformance.test.ts
sha256: 74dcb9336037702a33c5ff401e40cee8dfcb2746554d860d74ff4fdffc3af787
generated_at: 2026-11-08T09:28:37.578863+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/money-conformance.test.ts

## Purpose
Cross-language conformance test that verifies `src/domain-primitives/money.ts` produces identical results to its PHP twin for money arithmetic. Cases are defined in a shared YAML file (`shared/cases/money.cases.yaml`) so both implementations are checked against the same expectations.

## Key elements
- **`numeric`** – Zod schema accepting a number *or* the strings `'NaN'`, `'Infinity'`, `'-Infinity'`; transforms all to `Number`. Needed because YAML cannot natively carry those sentinels.
- **`minor`** – Zod schema for non-negative integers representing minor (smallest) currency units.
- **`moneyCase`** – Zod discriminated union (keyed on `kind`) covering all seven case shapes: `exponent`, `minor-text`, `minor-number`, `decimal`, `fits`, `apportion`, `scale-by-rate`.
- **`asMoney`** – One-line cast (`value as Money`) that brands a plain integer from the cases file as the `Money` branded type expected by the domain functions.
- **`describeCases('money', moneyCase, …)`** – Test runner callback; switches on `one.kind` and asserts the corresponding domain function output.

## Relationships
- **`src/domain-primitives/money.ts`** — Imports every function under test (`apportion`, `fitsCurrency`, `minorUnitExponent`, `toDecimalString`, `toMinorUnits`, `scaleMoneyByRate`) and the `Money` type alias. This file's assertions are the contract for that module.
- **`tests/support/cases.ts`** — Provides `caseBase` (a reusable Zod base schema each case variant extends) and `describeCases` (the harness that loads the YAML file, validates each row against `moneyCase`, and invokes the assertion callback per case).

## Notes
- **Negative-zero sensitivity:** `toBe` uses `Object.is`, so a `toMinorUnits` result of `-0` will fail against the YAML's plain `0`. Intentional; do not "fix" by switching to `toEqual`.
- **Branding is trust-based:** `asMoney` is an unchecked cast. The cases file is *defined* to hold minor units, so no runtime guard is needed—but a future editor should not remove the `Money` type from function signatures thinking the cast is the only protection.
- **ISO 4217 table** (currency → exponent) lives in the YAML file, not in this test or in `money.ts`. Adding a currency means updating the YAML, not this file.
