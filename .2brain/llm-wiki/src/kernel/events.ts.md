---
source: src/kernel/events.ts
sha256: 8f288686a2d8117ffe6acaefd7d385dc051d1c31880fc56a0436915b935dae9f
generated_at: 2026-09-27T14:18:38.691219+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/events.ts

## Purpose

A minimal in-process domain event bus that lets modules communicate without importing each other, keeping the dependency graph acyclic. It exists because some cross-module relationships are genuinely mutual (e.g. catalogue ↔ cart) and the event abstraction lets the arrow point one way. It is explicitly **not** a message broker: no durability, no retry, no replay.

## Key elements

- **`DomainEventMap`** — intentionally empty interface; a declaration-merging seam. Each module augments it with its own event-name → payload entries (e.g. `modules/products/events.ts`).
- **`DomainEventName`** — `Extract<keyof DomainEventMap, string>`; a string union of all declared event names, exported for runtime-lookup callers like `kernel/registry.ts`'s `resolvePublicEvents`.
- **`onDomainEvent(name, handler)`** — registers a handler for an event. Intended to be called from a module's `subscribe()` hook (orchestrated by `src/modules.ts`), not at import time.
- **`emitDomainEvent(name, payload)`** — emits and **sequentially awaits** every handler. Per-handler `try/catch` ensures one subscriber's failure does not block the rest. Returns `boolean`: `true` if all handlers resolved, `false` if at least one threw.
- **`resetDomainEvents()`** — clears all subscriptions. A test seam shipped to production (see Notes).
- **`handlers`** (module-private) — `Map<string, handler[]>` storing subscriptions in insertion order.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — imported as `logger`; used in `emitDomainEvent` to log an error when a subscriber throws.
- **`src/modules/orders/services/place.ts`, `cancel.ts`, `override.ts`, `status.ts`** — call `emitDomainEvent` and inspect the boolean return to discharge `orders`' `pendingEffects` (an in-module retry intention). Other emitters ignore the return.
- **`src/modules/cart/module.ts`, `src/modules/inventory/module.ts`, `src/modules/account/module.ts`** — subscribe via `onDomainEvent` in their `subscribe()` hooks and/or emit events; each augments `DomainEventMap` in its own `events.ts`.
- **Integration test files** (`api-keys.test.ts`, `service.test.ts`, `stock.test.ts`, `cancel.test.ts`, `pending-effects.test.ts`) — call `resetDomainEvents` between test cases to prevent handler accumulation.

## Notes

- **Sequential, awaited execution is load-bearing.** Emitters depend on the side-effect having completed (e.g. product removed from carts *before* it is deleted from the DB). Fire-and-forget would turn an ordering guarantee into a race.
- **A throwing handler does not stop the emitter or other handlers.** The emitting module owns its own failure semantics; it cannot reason about subscriber code it has never seen.
- **The boolean return is a contract for `orders`.** `pendingEffects` uses it to decide whether a retry intention is discharged. All other callers treat the emit as fire-and-continue.
- **`resetDomainEvents` is a real production risk.** Nothing in the type system or runtime prevents application code from calling it and silently unsubscribing every module. It exists solely so test suites don't accumulate handlers across cases.
- **Subscribe from `subscribe()`, not at import time.** The set of live handlers is meant to be decided by the module registry (`src/modules.ts`), not by import order.
