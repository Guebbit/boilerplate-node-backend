---
source: tests/unit/infrastructure/persistence/money-field.test.ts
sha256: 0e9ccb6eb7ab8534eaff5ec40077385af02ea7d86c161d0e4d9a1975ddbaec25
generated_at: 2026-11-08T10:22:06.253130+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/money-field.test.ts

## Purpose

Unit tests for the three helpers in `@infrastructure/persistence/money-field` that read stored Mongoose `Decimal128` values back into plain decimal text, at any nesting depth. The file covers only the pure "read side" of money-at-rest; the write side lives in a separate integration test.

## Key elements

- **`describe('decimalToString')`** — verifies that `decimalToString` returns the `.string` of a `Decimal128`, stringifies plain numbers, passes strings through unchanged, and returns `undefined` for `null`/`undefined`.
- **`describe('stringifyDecimals')`** — verifies in-place mutation of arbitrarily nested documents: every `Decimal128` leaf is replaced by its text, while `ObjectId`, `Date`, numbers, and `null` are left untouched. Also covers the bare-`Decimal128` input case.
- **`describe('padMoneyPaths')`** — parameterised over currency codes (EUR, JPY, KWD). Verifies that only the dot-delimited paths passed as the second argument are zero-padded to that currency's decimal places, and that absent keys are not created.

## Relationships

- Imports and exercises `decimalToString`, `padMoneyPaths`, `stringifyDecimals` from **`src/infrastructure/persistence/money-field.ts`** (the sole graph neighbor). No other modules are under test here.

## Notes

- `stringifyDecimals` mutates the input object and returns the *same reference* (`expect(revived).toBe(document)`); tests assert identity, not just equality.
- `padMoneyPaths` is deliberately path-scoped: the `note` field in the test fixture holds the same raw string but is **not** padded, confirming that only explicitly named paths are treated as money.
- JPY (zero-decimal) cases assert that a trailing `.00` is *stripped*, not just preserved—worth remembering when adding new currency fixtures.
