# src/kernel/events.ts

## Purpose

A minimal in-process domain event bus that lets modules communicate without importing each other, breaking would-be circular dependencies (e.g. products ↔ cart) into a one-directional emit/listen relationship. It is explicitly *not* a durable broker: no persistence, no retry, no replay.

## Key elements

- **`DomainEventMap`** (interface, exported, intentionally empty) — A declaration-merging seam. Each module augments it with its own event names and payload types; the union of all augmentations is the set of valid event names.
- **`onDomainEvent(name, handler)`** — Registers a handler for a named event. Intended to be called from a module's `subscribe()` hook (invoked by the registry), not at import time.
- **`emitDomainEvent(name, payload)`** — Emits an event and **awaits every handler sequentially**. A handler that throws is logged via `logger.error` and does not prevent subsequent handlers from running or reject the emitter's promise.
- **`resetDomainEvents()`** — Clears the handler map. Documented as a test seam (prevents handler accumulation across test cases) but shipped in production; application code could call it and silently unsubscribe all modules.
- Internal `handlers` — a `Map<string, ((payload: never) => unknown)[]>` storing subscriptions per event name.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Direct import. `emitDomainEvent` calls `logger.error` when a handler throws.
- **`src/kernel/registry.ts`** / module `module.ts` files (account, cart, delivery, orders, payments, etc.) — Modules register their event subscriptions via a `subscribe()` hook that the registry calls; they also call `onDomainEvent` and `emitDomainEvent` in service code. Each module's local `events.ts` augments `DomainEventMap`.
- **Integration test files** (cart, delivery, orders) — Call `resetDomainEvents()` in setup/teardown to avoid cross-test handler accumulation.
- **`docs/theory/modules.md`** — Conceptual reference for the module-boundary model this bus supports.

## Notes

- Handlers run **sequentially and are awaited**, not in parallel. The file's comments justify this: emitters depend on the side-effect having completed (e.g. a product must be removed from carts before it is removed from the DB).
- A failing handler does **not** roll back the emitter or stop other handlers. Failure containment is per-handler.
- `resetDomainEvents` is a deliberate production cost for test isolation; there is no guard preventing accidental production calls.
- Do not subscribe at module top-level / import time — the ordering of live handlers depends on the registry's `subscribe()` call order, not on import side-effects.
- `DomainEventMap` is kept empty in this file on purpose; do not add entries here. New event types belong in the emitting module's local `events.ts`.
