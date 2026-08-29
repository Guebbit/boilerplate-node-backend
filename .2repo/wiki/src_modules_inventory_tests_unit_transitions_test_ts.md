# src/modules/inventory/tests/unit/transitions.test.ts

## Purpose

Unit tests for the inventory transition table (`counterDeltaFor`) and the derived availability read (`availabilityOf`). Rather than restating each table row, the tests assert the three invariants the table encodes: only receipts/adjustments change unit counts, commits shift both columns equally, and reserve is exactly inverted by release/expire. No mocks or database are used — the functions under test are pure.

## Key elements

- **`counterDeltaFor` tests** — six `it` blocks verifying: exhaustive coverage of every `StockMovementReason` value, the closed set of reasons that mutate `onHand`, the commit invariant (`onHandDelta === reservedDelta`), the reserve-inverse property (parameterized over `release` and `expire`), the zero-`onHand` guarantee for reserve/release/expire, and sign preservation for `adjust`.
- **`availabilityOf` tests** — a table-driven test (`it.each`) covering normal, fully-reserved, and partially-absent counter objects, plus a dedicated clamp test asserting that a negative result is reported as `0`.
- **`EVERY_REASON`** — local constant built via `Object.values(StockMovementReason)`, reused to guarantee every contract reason is exercised.

## Relationships

- **`src/modules/inventory/domain/transitions.ts`** — the implementation under test; `counterDeltaFor` and `availabilityOf` originate here.
- **`src/modules/inventory/domain/index.ts`** — the barrel export the test imports from (`../../domain`), re-exporting the two functions from `transitions.ts`.
- **`src/types/index.ts`** — source of the `StockMovementReason` enum (aliased as `@types`), which defines the closed set of movement reasons the tests iterate over.

## Notes

- The tests deliberately do **not** hard-code individual delta values per reason (e.g., `reserve` → `{0, +1}`); they assert *relationships between* deltas. This is intentional: a row-by-row copy test would pass even if the table were duplicated with a shared bug.
- The `adjust` sign test exists to catch a `Math.abs` regression that would silently convert write-offs into gains.
- `availabilityOf({})` returning `0` is an explicit safety choice (treat missing counters as "nothing to sell"), not an oversight — the comment flags this as the safe direction for a number that gates a charge.
- The exhaustive-reason test doubles as a compile-time check: because `counterDeltaFor` switches over the enum, adding a reason without handling it only surfaces if this test calls it with that reason.
