# src/modules/orders/tests/unit/money.property.test.ts

## Purpose

Property-based tests (via `fast-check`) for the `Money` domain module. They verify the module's total invariant — that no arithmetic path can produce `NaN`, `Infinity`, or a sub-cent fraction — against both hostile and realistic inputs. The file exists because these guarantees hold for *every* input, not just hand-picked examples.

## Key elements

- **`RUN`** — Single `fc` options object (`seed: 20_260_819`, `numRuns: 300`, `endOnFailure: true`). Changing the seed here is the only place to alter reproducibility.
- **`anything()`** — Arbitrary that generates `double`, `integer`, `string`, `boolean`, `null`, `undefined`, `±MAX_VALUE`, and the string `'1e400'`. Models "anything a malformed document or hostile client can put where a price goes."
- **`realisticPrice()`** — Arbitrary for plausible catalogue prices (finite double, 0 to 1 000 000).
- **`toMinorUnits — totality`** (describe block) — Asserts the function is total: finite integer output for any input; junk collapses to `NO_MONEY`; overflow (`±MAX_VALUE`) is dropped rather than carried as `Infinity`.
- **`toMinorUnits ↔ toDecimalAmount`** (describe block) — Round-trip fidelity to the cent, ≤ 2 decimal places, and idempotency.
- **`addMoney`** (describe block) — Exactness, associativity, order-independence, empty-fold identity, and finiteness under hostile terms.
- **`scaleMoney`** (describe block) — Agreement with repeated `addMoney`, zero-count identity, finiteness for any count.
- **`wholeCount`** (describe block) — Integer output for any input; passthrough for genuine non-negative integers.

## Relationships

- **`src/modules/orders/domain/money.ts`** — Sole dependency. This file imports `addMoney`, `NO_MONEY`, `scaleMoney`, `toDecimalAmount`, `toMinorUnits`, and `wholeCount` from it. Every assertion in this file is a specification of one of those exports' contract.

## Notes

- Seeded runs: a failing property will print the counterexample; per the file header, that counterexample is then written back as a plain `it()` in this file. The property states the rule; the example remembers the bug.
- The `anything()` arbitrary intentionally includes non-numeric types (`string`, `boolean`, objects). The tested functions are expected to handle (reject) them gracefully — this is a total-function test, not a type-safety test.
- `Number.MAX_VALUE` is finite, so a naïve "is the input finite?" check passes, but multiplying by 100 overflows to `Infinity`. The test targets that specific edge.
- References `docs/theory/tactical-ddd.md` §3 for the design rationale behind the Money type's invariants.
