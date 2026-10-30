---
source: src/modules/orders/tests/unit/lifecycle.test.ts
sha256: 258f3b93de9b78773e8d68901d53328fe6007c245832dc436355ddfc3f16f609
generated_at: 2026-10-29T04:59:10.957442+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/lifecycle.test.ts

## Purpose
Unit tests for the order-lifecycle transition table and its helper predicates. The suite asserts **properties** (sentences) over the whole table rather than restating individual rows, so a wrongly-copied table fails against the invariant it encodes. Pure — no mocks, no database.

## Key elements
- **`EVERY_STATUS`** / **`EVERY_ACTOR`** / **`REQUEST_ACTORS`** / **`FULFILMENT_SEQUENCE`** — derived constants (built from `OrderStatus` and the actor literal union) used to drive exhaustive property checks without hard-coding rows.
- **`describe("the table names only the contract's statuses")`** — structural sanity: every status referenced by `ORDER_EVENTS` exists in the enum; every event has ≥1 actor and ≥1 origin; no self-loops; `cancelled` is a true terminal.
- **`describe('the named events')`** — pins the `ship`, `deliver`, `fulfilmentComplete`, `reship`, `reopen`, and `expire` edges to their exact `from`/`to`/`actors` shape.
- **`describe('who may write …')` blocks** (paid, processing, shipped/delivered, cancel) — for each target status, iterate every actor and assert the exact set of source statuses that may lead in, and that a human actor's direct `canTransition` call is refused.
- **`describe('terminal states')`** — `cancelled` is unreachable-out for everyone; `delivered` exits only via `system` (`reship`); reopening a cancelled or delivered order is denied to non-system actors.
- **`describe('direction')`** — global invariant: no actor may move backwards along `FULFILMENT_SEQUENCE` except `system`'s `reopen` (shipped→processing) and `reship` (delivered→processing); neither is override-eligible.
- **`describe('canTransition')`** — self-transitions are always false; `canTransition` and `statusesReachableFrom`/`statusesLeadingTo` are asserted as mutual inverses across the full status×actor grid.

## Relationships
- **`src/modules/orders/domain/lifecycle.ts`** — the module under test. Every assertion in this file reads from its exports (`ORDER_EVENTS`, `UNDELIVERABLE_EVENT`, `canTransition`, `canOverrideTo`, `statusesLeadingTo`, `statusesReachableFrom`, `orderActionsFor`, `overridableTargetsFrom`, the `OrderActor`/`OrderEvent` types, etc.).
- **`src/types/index.ts`** — supplies the `OrderStatus` enum, which the file uses both to enumerate the full status set (`EVERY_STATUS`) and as the domain value in every assertion.

## Notes
- The file deliberately avoids row-by-row assertions; comments reference `docs/theory/tactical-ddd.md` §1 and `src/modules/orders/services/status.ts` for the *why* behind specific edges.
- `withdrawal` is treated as a distinct actor (not aliased to `admin`), reflecting Directive Art. 9 consumer-withdrawal semantics.
- The `system` actor is the only one permitted to write `paid`, `processing`, `shipped`, `delivered`, or take the two backward edges — tests assert this exhaustively via `EVERY_ACTOR` loops so a new actor type is caught automatically.
- Truncated in the provided content: the final `canTransition` inverse-check loop and any subsequent `describe` blocks are cut off; the full file may contain additional assertions.
