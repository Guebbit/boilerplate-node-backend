---
source: src/kernel/events.ts
sha256: cd70c536e7ebcd365417eb5db567abd2e4237df45d5b5fe3daa1e3e4e61e5468
generated_at: 2026-09-23T17:55:04.400115+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/events.ts

## Purpose

In-memory domain-event bus that lets two modules react to each other without importing one another, keeping the dependency graph acyclic. It provides `on`/`emit`/`reset` over a declaration-merged event map. Explicitly **not** a message broker: no durability, no retry, no replay.

## Key elements

- **`DomainEventMap`** (empty interface) — the declaration-merging seam. Each module augments it with its own event-name → payload types; this file intentionally defines no members.
- **`onDomainEvent(name, handler)`** — registers a handler for a typed event name. Intended to be called from a module's `subscribe()` hook (orchestrated by `src/modules.ts`), not at import time.
- **`emitDomainEvent(name, payload)`** — awaits every registered handler **sequentially**. A handler that throws is caught, logged, and does not prevent later handlers from running. Returns `true` only if every handler resolved; `false` if at least one threw.
- **`resetDomainEvents()`** — clears all subscriptions. Documented as a test seam (prevents handler accumulation across suites) but exported to production with no guard.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — imported for `logger.error`; the only runtime dependency of this file. Used when a handler throws.
- **Module files (`cart`, `inventory`, `orders`, `account`, `addresses`)** — augment `DomainEventMap` via declaration merging, call `onDomainEvent` in their `subscribe()` hooks, and call `emitDomainEvent` as the sanctioned cross-module signal (e.g. product deletion → cart cleanup, order placement → stock reservation).
- **Integration tests (`cart`, `orders`)** — call `resetDomainEvents()` between cases so repeated module registration does not cause duplicate handler invocations.

## Notes

- **Ordering guarantee:** handlers are awaited in subscription order. The file's docblock calls out that fire-and-forget would turn this guarantee into a race (e.g. product must leave carts before the DB row is deleted).
- **Error semantics:** a throwing handler marks the emit as "not all settled" (`false` return) but does **not** roll back the emitter's own work. The `orders` module uses the boolean to decide whether a `pendingEffects` retry is needed; all other callers ignore it.
- **`resetDomainEvents` is a production-visible test seam.** Nothing prevents application code from calling it and silently unsubscribing every module. Treated as an accepted cost.
- **Subscription timing matters.** Handlers registered at import time would make the live handler set depend on import order; the convention is to defer to the `subscribe()` lifecycle hook.
