---
source: src/domain-primitives/lifecycle.ts
generated_at: 2026-11-22T02:32:32.476795+00:00
model: claude-code:claude-sonnet-5-5
---

# src/domain-primitives/lifecycle.ts

## Purpose
Models a module's lifecycle as a pure event table: named events, each with the statuses it may start from (`from`), the single status it lands on (`to`), and optionally which actors may trigger it. `defineLifecycle` validates the table and returns a set of query functions. The table stays in TypeScript; a contract carries only the status enum and `actions` flags. The event-based shape follows Solidus/Symfony Workflow and Google AIP-216's one-verb-per-transition.

## Key elements
- `LifecycleEvent<TStatus, TActor>`: one event with `from`, `to`, and optional `actors`. If `actors` is absent, the table does not restrict who may make the event.
- `LifecycleTable<TStatus, TEvent, TActor>`: the input, made of `initial` plus `events` keyed by event name.
- `Lifecycle<TStatus, TEvent, TActor>`: the returned interface:
  - `initial`: the starting status.
  - `allows(event, status, actor?)`: whether the event can be taken from the status, by the actor if one is given.
  - `fromOf(event)` / `toOf(event)`: an event's source statuses and its target status.
  - `eventsFrom(status, actor?)`: the allowed events, in table order.
  - `reachableFrom(status, actor?)`: the target statuses, deduplicated, in table order.
  - `canTransition(from, to, actor?)`: whether some event moves `from` to `to`.
- `defineLifecycle(statuses, table)`: builds the `Lifecycle`. It throws an `Error` when:
  - the initial status is unknown;
  - an event has an empty `from`;
  - an event names an unknown status in `from` or `to`;
  - an event's `to` is inside its own `from`.

## Relationships
- The per-module lifecycle definitions are the consumers: `src/modules/delivery/domain/lifecycle.ts`, `src/modules/example/domain/lifecycle.ts`, `src/modules/orders/domain/lifecycle.ts` and `src/modules/returns/domain/lifecycle.ts`. Each supplies its statuses and event table.
- Tests cover it at three levels: the generic primitive in `tests/unit/domain-primitives/lifecycle.test.ts`, and the delivery and returns modules in `src/modules/delivery/tests/unit/lifecycle.test.ts` and `src/modules/returns/tests/unit/lifecycle.test.ts`.

## Notes
- A self-move is illegal by construction: `defineLifecycle` rejects an event whose `to` is in its own `from`, and `canTransition` never treats staying in place as a move.
- When `actor` is omitted from a query, or an event has no `actors`, the actor check passes. Actor enforcement therefore depends on callers passing an actor.
- `fromOf` is meant for use as a conditional write's `from` set.
- Event names are unique because they are object keys, and `Object.keys` is cast back to `TEvent[]`.
- The functions only answer queries. They do not hold state or apply transitions.
- The source's `@see` points to `docs/understand/tactical-ddd.md#deciding-and-enforcing-stay-separate` for the rationale on keeping deciding and enforcing separate.
