---
source: src/domain-primitives/lifecycle.ts
sha256: d725ae3feced0498a22247e579f27d06727d2824e8e74b22a1fa97dc964aea29
generated_at: 2026-11-08T03:15:17.937891+00:00
model: ollama:qwen3.8:27b
---

# src/domain-primitives/lifecycle.ts

## Purpose

A framework-agnostic, type-safe lifecycle (state machine) defined as a declarative event table. It gives every module a single source of truth for which named events are legal from which statuses, who may fire them, and where they land — validated once at construction, queried via a small read-only interface. The shape mirrors Solidus / Symfony Workflow event tables and Google AIP-216's one-verb-per-transition principle.

## Key elements

- **`LifecycleEvent<TStatus, TActor>`** — Describes one named transition: `from` (allowed starting statuses), `to` (the single landing status), and optional `actors` (who may fire it; absent = unrestricted).
- **`LifecycleTable<TStatus, TEvent, TActor>`** — The raw declaration: `initial` (start status) and `events` (a `Record` of event-name → `LifecycleEvent`).
- **`Lifecycle<TStatus, TEvent, TActor>`** — The read-only query surface returned by `defineLifecycle`. Exposes: `initial`, `allows(event, status, actor?)`, `fromOf(event)`, `toOf(event)`, `eventsFrom(status, actor?)`, `reachableFrom(status, actor?)`, `canTransition(from, to, actor?)`.
- **`defineLifecycle(statuses, table)`** — Factory. Validates the table at construction (rejects unknown statuses, empty `from`, self-moves where `to ∈ from`) and returns a closed-over `Lifecycle` instance. All query logic lives in local closures over a pre-computed `names` array and `eventOf` helper.

## Relationships

- **`src/modules/example/domain/lifecycle.ts`** — Consumes `defineLifecycle` to declare the Example module's statuses, events, and actor rules, producing a module-specific `Lifecycle` instance.
- **`src/modules/orders/domain/lifecycle.ts`** — Same pattern for the Orders module; both modules get their lifecycle from this shared primitive rather than re-implementing transition logic.
- **`tests/unit/domain-primitives/lifecycle.test.ts`** — Unit-tests the validation rules (unknown status, empty `from`, self-move rejection) and the query methods (`allows`, `eventsFrom`, `reachableFrom`, `canTransition`) including actor filtering.

## Notes

- **Self-moves are illegal by construction.** `defineLifecycle` throws if any event's `to` appears in its own `from`. This is the only structural invariant enforced beyond "all named statuses must exist."
- **`actors` is opt-in per event.** When an event omits `actors`, the lifecycle treats it as unrestricted; the *caller's* permission keys are the authority. When present, it is an allow-list.
- **`reachableFrom` deduplicates.** Two events landing on the same status from the same source produce one entry in the result; first-occurrence order is preserved via `Set` + spread.
- **Event-name uniqueness is guaranteed by JS object-key semantics**, not by explicit checking. The `Object.keys(table.events) as TEvent[]` cast is safe because keys are structurally unique.
- **`canTransition(from, to)` never returns `true` when `from === to`** — a status transitioning to itself is not considered a move, consistent with the self-move prohibition.
