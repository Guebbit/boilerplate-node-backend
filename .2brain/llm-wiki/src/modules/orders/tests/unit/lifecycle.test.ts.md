---
source: src/modules/orders/tests/unit/lifecycle.test.ts
sha256: bbb66a4f0e4440dce4d6909c68d9725ad9945eb52c9415fb4ef4806b15684604
generated_at: 2026-09-27T15:21:45.633536+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/lifecycle.test.ts

## Purpose

Pure unit test for the `ORDER_LIFECYCLE` state-transition table and its helper functions in `src/modules/orders/domain/lifecycle.ts`. No mocks, no database. The file asserts the *sentences* the table encodes (invariants, direction, actor restrictions) rather than restating individual rows, so a copy-pasted table with a wrong entry still fails.

## Key elements

- **Constants** — `EVERY_STATUS` (all `OrderStatus` values), `EVERY_ACTOR` / `REQUEST_ACTORS` (actor lists for exhaustive loops), `FULFILMENT_SEQUENCE` (the five statuses on the happy-path line, excluding `cancelled`).
- **"the table is total over the contract"** — verifies key completeness, destination validity, and that no edge has an empty actor list.
- **"who may write `paid` / `processing` / `shipped` / `delivered`"** — locks down that only the `system` actor (i.e. an external fact recorded by another module) can enter these statuses; `admin` hand-writes are explicitly refused.
- **"who may cancel"** — enumerates the exact cancellable set per actor (customer ≤ `paid`, admin ≤ `processing`, system only `pending`), and asserts `shipped` is never cancellable.
- **"terminal states"** — `delivered` and `cancelled` have zero outgoing edges for any actor; reopening is refused.
- **"direction"** — property-based sweep proving no backwards edge exists along `FULFILMENT_SEQUENCE` for any actor.
- **"canTransition"** — tests idempotent echo writes, the `paid`-echo exception, mutual consistency between `statusesReachableFrom` and `statusesLeadingTo`, and literal forward-direction anchors to catch a wrong entry that both wrappers would share.
- **"isPayable"** — true only for `pending`; agrees with `orderActionsFor(…, 'admin').pay`.
- **"orderActionsFor"** — cross-checks its `transitions` and `cancel` fields against `statusesReachableFrom`, plus literal action expectations for known statuses.

## Relationships

- **`src/modules/orders/domain/lifecycle.ts`** — the module under test. This file imports `ORDER_LIFECYCLE`, `canTransition`, `canOverrideTo`, `statusesOverridableInto`, `isPayable`, `orderActionsFor`, `statusesLeadingTo`, `statusesReachableFrom`, and the `OrderActor` type.
- **`src/types/index.ts`** — source of the `OrderStatus` enum used for exhaustive enumeration and the contract-completeness checks.

## Notes

- The file deliberately does **not** test `canOverrideTo` or `statusesOverridableInto` despite importing them; those paths are exercised elsewhere (admin override with step-up).
- Several comments reference specific bugs/decisions: **B21** (reservation-sweep race: `system` actor may cancel only from `pending`, not `paid`) and **SH1** (removed `admin`'s ability to reach `processing` from `paid` via the ordinary lifecycle).
- The "literal anchors" tests (e.g. `statusesReachableFrom(OrderStatus.pending, 'admin')` → `[cancelled]`) exist because the mutual-consistency test alone would pass if both wrappers shared the same wrong table entry.
- Testing philosophy and rationale are documented in `docs/theory/tactical-ddd.md` §1.
