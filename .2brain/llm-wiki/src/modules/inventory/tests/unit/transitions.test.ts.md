---
source: src/modules/inventory/tests/unit/transitions.test.ts
sha256: f3733fc553823f37f064372e8338305bfa027e86997a863ca6506232f16ace4c
generated_at: 2026-11-14T20:10:57.426993+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/transitions.test.ts

## Purpose

Pure unit tests for `counterDeltaFor`, the inventory transition table. The tests assert three domain invariants (only receipt/adjustment/shipment change unit existence; shipment moves both counters equally; reserve/release-expire are exact inverses) rather than merely restating the table, so a test that would pass against a wrong copy of the table is explicitly ruled out. No mocks, no database.

## Key elements

- **`EVERY_REASON`** — `Object.values(StockMovementReason)`, used to drive exhaustiveness and filter-based tests.
- **Exhaustiveness test** (`covers every reason…`) — iterates every enum value through `counterDeltaFor` so that a reason added to the contract but not the table is a compile error.
- **`it.each` signed-delta table** — pins the exact `{onHandDelta, reservedDelta, backorderedDelta}` triple for all nine reasons at quantity 3, matching the literal table in `openapi.yaml`.
- **"Only shipment/receipt/adjust/restock change existence"** — filters `EVERY_REASON` to those with a non-zero `onHandDelta` and asserts the set is exactly those four.
- **"Ships without changing availability"** — asserts `onHandDelta === reservedDelta` (both `-n`), so `onHand - reserved` is untouched.
- **`it.each([release, expire])` inverse test** — verifies `counterDeltaFor(reserve, n) + counterDeltaFor(undoing, n)` is zero on both `onHand` and `reserved`.
- **"Never lets reserve/release/expire touch what exists"** — asserts `onHandDelta === 0` for all three.
- **Adjust sign test** — passes `-3` and `+3` into `adjust` to lock in that the sign is carried through (guards against a `Math.abs` regression).
- **Backorder (preorder) test** — asserts `backorder` only touches `backorderedDelta`, and that `release`/`expire` with a `'backorder'` source parameter reverse it without touching shelf counters.
- **Allocate test** — asserts `reservedDelta === -backorderedDelta` and `onHandDelta === 0`, i.e. allocation converts a claim into a hold without creating units.

## Relationships

- **`src/modules/inventory/domain/index.ts`** — barrel import; the test pulls `counterDeltaFor` from this re-export.
- **`src/modules/inventory/domain/transitions.ts`** — the module that actually implements `counterDeltaFor`; this file is its behavioral contract.
- **`src/types/index.ts`** — provides the `StockMovementReason` enum whose members define the universe of reasons the tests iterate over.

## Notes

- The exhaustiveness test exists specifically to force a compile-time error if a new `StockMovementReason` member is added without a corresponding row in the transition table; a simple type-check won't catch it unless something calls `counterDeltaFor` with that value.
- `adjust` is the only reason whose quantity is pre-signed. The tests explicitly pass a negative value to ensure shrinkage (write-off) is not silently flipped to a positive delta.
- `release` and `expire` accept an optional source parameter (e.g. `'backorder'`) that routes the reversal to the correct counter; the test verifies this by asserting `backorderedDelta` is reversed while shelf counters stay at zero.
- The test file uses `Array.prototype.toSorted()` (not `sort`), implying a target runtime supporting ES2023.
