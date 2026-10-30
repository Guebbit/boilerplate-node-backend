---
source: src/domain-primitives/lifecycle.ts
sha256: d725ae3feced0498a22247e579f27d06727d2824e8e74b22a1fa97dc964aea29
generated_at: 2026-10-29T01:51:45.202624+00:00
model: ollama:qwen3.8:27b
---

# src/domain-primitives/lifecycle.ts

## Purpose

Defines the shared, module-agnostic event-table lifecycle primitive: the type shapes (`LifecycleEvent`, `LifecycleTable`, `Lifecycle`) and the single factory `defineLifecycle` that turns a declarative table of named transitions into a queryable lifecycle object. Every domain module that models a state machine (example, orders, …) builds on this one definition so that the rules for *what transitions exist* and *who may take them* are stated once and checked uniformly.

## Key elements

- **`LifecycleEvent<TStatus, TActor>`** — one named move: `from` (allowed starting statuses), `to` (single landing status), optional `actors` (who may make it; absent = the table is silent).
- **`LifecycleTable<TStatus, TEvent, TActor>`** — the input shape: an `initial` status plus a record of `events` keyed by event name.
- **`Lifecycle<TStatus, TEvent, TActor>`** — the returned query interface: `initial`, `allows(event, status, actor?)`, `fromOf`, `toOf`, `eventsFrom(status, actor?)`, `reachableFrom(status, actor?)`, `canTransition(from, to, actor?)`.
- **`defineLifecycle(statuses, table)`** — validates the table (all statuses known, every event has a non-empty `from`, no self-move) and returns a `Lifecycle`. Throws on any violation.

## Relationships

- **`src/modules/example/domain/lifecycle.ts`** and **`src/modules/orders/domain/lifecycle.ts`** — concrete callers that pass their status enum and event table into `defineLifecycle` to obtain a typed `Lifecycle` for their own domain logic.
- **`tests/unit/domain-primitives/lifecycle.test.ts`** — unit-tests the validation rules (unknown status, empty `from`, self-move rejection) and the query methods (`allows`, `eventsFrom`, `reachableFrom`, `canTransition`).

## Notes

- **Self-moves are impossible by construction.** `defineLifecycle` throws if `to` appears in its own `from`; `canTransition` also explicitly excludes staying in place ("Staying where it is is never a move").
- **`actors` tri-state.** `undefined` on the event means "the table does not say" (caller's keys decide); `undefined` on the call site means "anyone." Only a present, non-empty `actors` array restricts who may act.
- **`statuses` parameter is required at call time** solely for validation. It is not stored; after construction the lifecycle only references statuses that passed the check.
- **Event-name uniqueness** is guaranteed by the `Record<TEvent, …>` shape (object keys); no extra dedup logic is needed.
- **Design lineage.** The event-table shape (not a status→status map) follows Solidus / Symfony Workflow and maps 1:1 to Google AIP-216's one-verb-per-transition rule, per `docs/theory/tactical-ddd.md#deciding-and-enforcing-stay-separate`.
