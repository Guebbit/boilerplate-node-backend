---
source: tests/unit/infrastructure/persistence/money-field.test.ts
sha256: 63004215622c2a43b434979b78b652a118f9f37a68487186b92bc51a8c467591
generated_at: 2026-10-15T13:18:13.262376+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/money-field.test.ts

## Purpose

Unit tests for the pure (non-DB) side of money-at-rest: verifying that stored `Decimal128` values can be read back as plain numbers, whether they appear at the top level or buried arbitrarily deep inside a nested document. The complementary "database half" lives in an integration test of the same name.

## Key elements

- **`describe('decimalToNumber')`** — Exercises `decimalToNumber` from `@infrastructure/persistence/money-field`:
  - Converts a `Types.Decimal128` (via `fromString`) to its numeric value.
  - Passes a plain `number` through unchanged.
  - Returns `undefined` for `null`, `undefined`, and string inputs (i.e., anything that is neither a `Decimal128` nor a `number`).

- **`describe('reviveDecimals')`** — Exercises `reviveDecimals` from the same module:
  - Mutates a nested document **in place** (`revived === document`), replacing every `Decimal128` leaf with its numeric value while preserving sibling fields.
  - Handles a bare `Decimal128` argument by returning the number directly.
  - Leaves `Types.ObjectId`, `Date`, plain numbers, and `null` untouched.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** — The module under test. This file imports `decimalToNumber` and `reviveDecimals` from it (via the `@infrastructure/persistence/money-field` alias). No other graph neighbors are involved.

## Notes

- Tests assert **mutation in place** for `reviveDecimals` (`expect(revived).toBe(document)`), not immutability. If you refactor toward a new-object return, these assertions will break.
- The "anything else → `undefined`" contract for `decimalToNumber` is intentional and explicitly tested (string `'19.99'` → `undefined`). Do not "helpfully" add a `parseFloat` fallback without updating these expectations.
- The file-header comment positions this as the *reading* half; the corresponding *writing* (integration) test is a separate file — changes to the serialization path won't be caught here.
