---
source: src/kernel/events.ts
sha256: 06bd379cb8c72d575c6386e76c63689b7bb98567497400912ef1b4926bf98cab
generated_at: 2026-10-29T02:19:21.771137+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/events.ts

## Purpose

In-process domain event bus that lets two modules communicate when a direct import would create a circular dependency. It provides a typed, synchronous publish/subscribe mechanism with per-handler error isolation. It is explicitly *not* a message broker: no durability, no retry, no replay—those concerns belong to `kernel/outbox.ts`.

## Key elements

- **`DomainEventMap`** — An intentionally empty interface that each module augments via TypeScript declaration merging. The map is the single extension point; no central registry of event names is maintained.
- **`DomainEventName`** — A string-union type derived from `keyof DomainEventMap`. Exported so callers that discover event names at runtime (e.g. the module registry) have a type to cast back to.
- **`DomainEventMeta`** — Optional metadata carried alongside a payload. Currently holds `eventId` (the outbox row id) for deduplication on redelivery.
- **`onDomainEvent(name, handler)`** — Subscribe a handler to a named event. Intended to be called from a module's `subscribe()` hook, not at import time.
- **`emitDomainEvent(name, payload, meta?)`** — Fire an event; handlers run **sequentially and awaited**. A throwing handler is logged and skipped; remaining handlers still run. Returns `true` if all handlers resolved, `false` if at least one threw.
- **`markDomainEventsWired()` / `domainEventsWired()`** — A process-level flag set once by `registerModules` after all `subscribe()` calls have run. Read by the outbox relay to avoid dispatching into a process where nothing is listening.
- **`resetDomainEvents()`** — Clears all handlers and resets the wired flag. A test seam; shipped to production with an acknowledged cost (application code *could* call it and silently unsubscribe every module).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imported; `emitDomainEvent` logs each handler failure through `logger.error` with the error object in a structured record.
- **`src/kernel/outbox.ts`** — The outbox relay is the sole producer of `meta.eventId` and the sole consumer of the `emitDomainEvent` boolean return (to decide whether to redeliver a row). It also calls `domainEventsWired()` to guard against publishing into an unwired process.
- **`src/kernel/registry.ts`** — `resolvePublicEvents` collects event names from module manifests at runtime; it relies on the `DomainEventName` export to type-cast those names back into `emitDomainEvent` / `onDomainEvent` calls.
- **Module `module.ts` files** (account, api-keys, cart, etc.) — Each module calls `onDomainEvent` inside its `subscribe()` hook to register consumers, and calls `emitDomainEvent` when a domain fact occurs. They augment `DomainEventMap` with their own event/payload types.
- **Integration test files** (e.g. `consent-withdrawal.test.ts`, `checkout-interleavings.test.ts`) — Call `resetDomainEvents` in setup/teardown to prevent handler accumulation across test cases within the same process.

## Notes

- **Declaration-merging seam.** `DomainEventMap` is empty by design. Adding an event requires augmenting the interface in the owning module's file (e.g. `modules/products/events.ts`), not editing a central list. The `eslint-disable` on the interface is load-bearing—remove it and the linter will flag an "empty object type."
- **Subscription order is preserved.** Handlers for a given event name fire in the order `onDomainEvent` was called. There is no priority or cancellation mechanism.
- **Error semantics are asymmetric.** A handler that throws does *not* roll back the emitter's already-committed write. The return value (`false`) is advisory; the outbox relay uses it, but a direct `emitDomainEvent` caller can ignore it and continue.
- **`wired` ≠ "has handlers."** A process can have handlers registered but `wired === false` if `registerModules` has not yet completed its pass. Conversely, `wired === true` does not guarantee any particular event has subscribers.
- **`resetDomainEvents` is a production-visible export.** There is no build-time or flag-based guard preventing non-test code from calling it.
