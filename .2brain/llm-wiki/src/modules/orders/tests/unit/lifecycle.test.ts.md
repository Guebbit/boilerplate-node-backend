---
source: src/modules/orders/tests/unit/lifecycle.test.ts
sha256: 12326bedc7554251c8d02e32155d2ff4d05141c842f5d6daf0b5a5982c09dd8b
generated_at: 2026-10-15T11:19:59.884438+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/lifecycle.test.ts

## Purpose

Pure unit tests for the order-lifecycle state machine in `src/modules/orders/domain/lifecycle.ts`. Rather than restating individual table rows (which would pass even if the table were copied wrong), the suite asserts the *properties* the table must satisfy: terminality, direction, actor restrictions, and cross-function consistency. No mocks, no database.

## Key elements

- **`EVERY_STATUS`** – `Object.values(OrderStatus)`; new enum members are picked up automatically.
- **`EVERY_ACTOR`** – all five actors: `customer`, `admin`, `system`, `withdrawal`, `fulfilment`.
- **`REQUEST_ACTORS`** – the subset an HTTP caller can be (`customer`, `admin`).
- **`FULFILMENT_SEQUENCE`** – `pending → paid → processing → shipped → delivered`; used by the direction invariant.
- **describe: "the table names only the contract's statuses"** – integrity checks: every event uses declared statuses, has ≥1 actor and ≥1 origin, no self-loops, no outgoing edges from terminal states.
- **describe: "the named events"** – spot-checks `ship`, `deliver`, `fulfilmentComplete`, and `expire` edges against the table.
- **describe: "who may write `paid` / `processing` / `shipped` / `delivered`"** – asserts these statuses are reachable *only* via the `system` actor (recorded external facts); admin/customer writes are refused.
- **describe: "who may cancel"** – per-actor cancellable sets; `system` is restricted to `pending` only (B21 race); `fulfilment` covers `cancelUnanswered`; shipped orders are never cancellable by anyone.
- **describe: "terminal states"** – `delivered` and `cancelled` are truly final for every actor; reopens are refused.
- **describe: "direction"** – no backwards edge along `FULFILMENT_SEQUENCE` for any actor.
- **describe: "canTransition"** – no self-transitions; `statusesLeadingTo` and `statusesReachableFrom` are logical inverses; literal forward-direction anchors for `statusesReachableFrom`.
- **describe: "isPayable"** – (content truncated in source) covers the payable-state predicate.

## Relationships

- **`src/modules/orders/domain/lifecycle.ts`** – the module under test. All assertions target its exports: `ORDER_EVENTS`, `canTransition`, `canOverrideTo`, `isPayable`, `orderActionsFor`, `statusesLeadingTo`, `statusesReachableFrom`, `paymentSettled`, `overridableTargetsFrom`, and the `OrderActor` / `OrderEvent` types.
- **`src/types/index.ts`** – provides the `OrderStatus` enum (imported as `@types`), which defines the set of statuses the table is validated against.

## Notes

- The file header explicitly rejects row-by-row restatement: if the test table were a copy of the production table, a copy error would pass both. Tests therefore assert *sentences* (invariants) instead.
- `paid`, `processing`, `shipped`, and `delivered` are each asserted as **system-only** entry points—no human actor may write them directly. The actual HTTP path goes through `src/modules/orders/services/status.ts` doors.
- The `system` actor's cancel set is intentionally narrower than `admin`'s (`pending` only vs. `pending`/`paid`/`processing`) to prevent the reservation-sweep from cancelling an already-paid order (referenced as "B21's race").
- Withdrawal rights are anchored to EU Directive Art. 9 in a comment; the assertion mirrors `admin`'s cancel set but uses a distinct actor string.
- The inverse-consistency test (`canTransition` describe) only proves the two wrapper functions agree *with each other*; the literal forward anchors added in the same block close the gap where both could be wrong in the same direction.
- See `docs/theory/tactical-ddd.md` §1 for the rationale behind each rule.
