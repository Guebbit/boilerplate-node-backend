---
source: tests/unit/domain-primitives/money-min.test.ts
sha256: 5bfca827be1dd37ee97d5fdb6f3dd862d483203dc3d6c7f15e4044334a4314c8
generated_at: 2026-11-08T10:04:09.525294+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/domain-primitives/money-min.test.ts

## Purpose

Unit tests for the `minMoney` function, verifying it correctly returns the smallest `Money` amount from a variadic set of arguments, including the single-argument edge case.

## Key elements

- **`describe('minMoney')`** — test suite covering two behaviors:
  - *"answers the smallest amount"* — asserts `minMoney` returns the smallest of 2–3 amounts regardless of argument order; also covers a duplicate-argument case.
  - *"answers the amount itself when it is the only one"* — asserts `minMoney(x)` is identity for a single argument.
- **`toMinorUnits(amount, currency)`** — helper imported from the money module; used solely to construct `Money` fixtures for the assertions.

## Relationships

- **`src/domain-primitives/money.ts`** — the module under test. This file imports `minMoney` (the SUT) and `toMinorUnits` (fixture factory) from it via the `@domain-primitives/money` alias.

## Notes

- Assertions use `toBe` (reference identity), not structural equality. This confirms `minMoney` is expected to return one of the *exact* input objects rather than a copy or a new allocation.
- The file-level JSDoc calls out "no cast at the call site," signalling the public type signature of `minMoney` is designed so callers never need a type assertion.
