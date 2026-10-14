---
source: src/kernel/events.ts
sha256: b896d119244f1a76b47154d04efcf0b95c9fe1c535d98341c18718f5373e7dbc
generated_at: 2026-10-14T08:22:12.794461+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/events.ts

## Purpose

In-process domain event bus: the sanctioned mechanism for two modules to communicate when a direct import would create a cycle in the dependency graph (enforced by `.dependency-cruiser.cjs`). Explicitly **not** a durable broker — no retry, no replay. Durability and redelivery are the outbox relay's job; this file only fans an event out to in-process subscribers.

## Key elements

- **`DomainEventMap`** (interface, intentionally empty) — declaration-merging seam. Each module augments it in its own file (e.g. `modules/products/events.ts`) so the map grows without editing a central list.
- **`DomainEventName`** (type) — `Extract<keyof DomainEventMap, string>`; the string union of all declared event names. Used by `kernel/registry.ts` to cast a runtime-discovered name back into the typed subscribe API.
- **`DomainEventMeta`** (interface) — carries `eventId?` (the outbox row id) so a consumer can deduplicate redelivered events. Empty for a plain in-process emit.
- **`onDomainEvent(name, handler)`** — registers a handler for a specific event name. Handlers run in subscription order.
- **`emitDomainEvent(name, payload, meta?)`** — invokes all handlers for `name` **sequentially and awaited**; a throwing handler is logged and skipped, remaining handlers still run. Returns `boolean`: `true` if every handler resolved.
- **`markDomainEventsWired()` / `domainEventsWired()`** — set/read the `wired` flag. The outbox relay checks this before dispatching so an event isn't marked "published" in a process that has no subscribers.
- **`resetDomainEvents()`** — clears all handlers and resets `wired`. Intended as a test seam (see Notes).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — imports `logger`; used to log an error record when a handler throws inside `emitDomainEvent`.
- **`src/kernel/outbox.ts`** — the outbox relay calls `emitDomainEvent` with a populated `DomainEventMeta.eventId` and reads `domainEventsWired()` to guard against publishing into a process with zero subscribers.
- **`src/kernel/registry.ts`** — `resolvePublicEvents` collects event names from module manifests at runtime; the result is cast via `DomainEventName` before being passed to `onDomainEvent`.
- **Module files** (`account/module.ts`, `api-keys/module.ts`, `cart/module.ts`, …) — each augments `DomainEventMap` via declaration merging and calls `onDomainEvent` inside its `subscribe()` hook (wired by `registerModules` → `markDomainEventsWired`).
- **Integration test suites** (api-keys, cart) — call `resetDomainEvents()` between cases to prevent handler accumulation across test runs.

## Notes

- **`DomainEventMap` is empty by design.** Do not add members here; extend it in the owning module's events file.
- **`emitDomainEvent` is sequential, not concurrent.** Two handlers on the same event never race. The emitter `await`s the whole cascade.
- **A throwing handler does not abort the cascade or the emitter.** It is logged and skipped; the return value (`false`) is the only signal to the caller.
- **`resetDomainEvents` is shipped to production** for the benefit of test suites. Application code calling it silently unsubscribes every module — treat it as test-only.
- **Subscribe in `subscribe()`, not at import time.** The set of live handlers is decided by `src/modules.ts`, not by import order.
- **Stryker mutation testing** is disabled on the per-handler `catch` block (`Stryker disable next-line all`) because the catch is the safety net that isolates one handler's failure from the rest.
