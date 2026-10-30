---
source: tests/cross-cutting/money-conformance.test.ts
sha256: 77a68430f23b9677ee0c32d0d39d13e53ef66cd8649029a73475117a979a4c2b
generated_at: 2026-10-29T06:47:21.977581+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/money-conformance.test.ts

## Purpose

Conformance test suite that verifies the TypeScript money primitives produce results identical to the PHP twin implementation. It loads a shared set of 70 YAML-defined cases (`shared/cases/money.cases.yaml`) and dispatches each to the corresponding function under test, asserting exact output.

## Key elements

- **`numeric`** — Zod schema accepting a number *or* the strings `"NaN"`, `"Infinity"`, `"-Infinity"`; transforms to a JS number. Workaround for YAML's inability to emit those as native values.
- **`minor`** — Zod schema for integer minor-unit values.
- **`moneyCase`** — Zod discriminated union over `kind` with seven variants: `exponent`, `minor-text`, `minor-number`, `decimal`, `fits`, `apportion`, `scale-by-rate`. Each variant shapes the inputs and expected output for one function.
- **`asMoney`** — Type-level cast from a plain `number` to the branded `Money` type; the YAML file stores minor units as unbranded integers.
- **`describeCases('money', moneyCase, 70, …)`** — Entry point that iterates the 70 cases and, in a `switch` on `kind`, calls the matching imported function and asserts the result.

## Relationships

- **`src/domain-primitives/money.ts`** — The module under test. This file imports `apportion`, `fitsCurrency`, `minorUnitExponent`, `toDecimalAmount`, `toMinorUnits`, `scaleMoneyByRate`, and the `Money` type from it.
- **`tests/support/cases.ts`** — Provides `caseBase` (the shared Zod base schema for every case entry) and `describeCases` (the runner that loads the YAML file, validates each row against the provided schema, and drives the assertion callback).

## Notes

- The suite asserts with `toBe` (i.e. `Object.is`), deliberately so a negative-zero result would fail against the YAML's plain `0`.
- The ISO 4217 currency table is defined in the YAML file, not here; the `exponent` cases simply check that `minorUnitExponent` reproduces it.
- `asMoney` is a no-op at runtime; it exists only to satisfy the branded-type signature of the functions under test.
- Expected case count is hardcoded as `70` in the `describeCases` call—adding or removing YAML entries without updating this number will cause a suite-level failure.
