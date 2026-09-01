# src/modules/orders/tests/unit/money.property.test.ts

## Purpose

Property-based tests (via `fast-check`) for the `Money` domain module. The invariant under test is that no monetary arithmetic produces `NaN`, `Infinity`, or a sub-cent fraction **for every possible input**, so the generators are deliberately hostile (garbage strings, booleans, overflow values) rather than just realistic. The file exists to give the team a single reproducible, seeded proof surface for those invariants.

## Key elements

- **`RUN`** — single seed (`20_260_819`), `numRuns: 300`, `endOnFailure: true` shared by every `fc.assert` call in the file.
- **`anything()`** — `fc.oneof` generator producing `double`, `integer`, `string`, `boolean`, `null`, `undefined`, `Number.MAX_VALUE`, `-Number.MAX_VALUE`, and the string `'1e400'`. The "hostile" half of the input space.
- **`realisticPrice()`** — `fc.double` in `[0, 1e6]` with no NaN/Infinity. The "realistic" half.
- **`describe('toMinorUnits — totality')`** — asserts `toMinorUnits` returns a finite `Integer` for *any* input; pins specific junk values to `NO_MONEY`; verifies overflow (±`MAX_VALUE`) collapses to `NO_MONEY`.
- **`describe('toMinorUnits ↔ toDecimalAmount')`** — round-trip fidelity to the cent, ≤ 2 decimal places for any input, and idempotence.
- **`describe('addMoney')`** — exactness / associativity / commutativity via reversed arrays; empty-list fold to `NO_MONEY`; finiteness under hostile terms.
- **`describe('scaleMoney')`** — equivalence to repeated addition (catches `+`-where-`*`-belongs bugs); zero-quantity → `NO_MONEY`; finiteness for any price × count.
- **`describe('wholeCount')`** — totality (finite integer for any input) and pass-through for genuine non-negative integers.

## Relationships

- **`src/modules/orders/domain/money.ts`** — sole import target. The file exercises six exports: `toMinorUnits`, `toDecimalAmount`, `addMoney`, `scaleMoney`, `wholeCount`, and the `NO_MONEY` sentinel. No other module is referenced at runtime.

## Notes

- **Seeded & reproducible.** A single `RUN` constant governs every property test; change the seed in one place. If a counterexample is found, the convention (stated in the file header) is to pin it as an ordinary `it()` block so it doesn't disappear on re-seed.
- **`toMinorUnits` is the gatekeeper.** The first test explicitly notes "every other function takes its input from this one," so its totality test runs first and is the broadest.
- **`Number.MAX_VALUE` edge.** A dedicated test exists because the value is finite *on its own* but overflows once multiplied by 100 (the minor-unit conversion) — a property that a naive "check the input" assertion would miss.
- **Convention reference.** The file header points to `docs/theory/tactical-ddd.md` §3 for the design rationale behind the totality requirement.
