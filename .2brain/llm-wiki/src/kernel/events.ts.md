---
source: src/kernel/events.ts
sha256: 06bd379cb8c72d575c6386e76c63689b7bb98567497400912ef1b4926bf98cab
generated_at: 2026-11-08T03:53:25.638859+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/events.ts

## Purpose

In-process domain event bus that lets two modules communicate without a direct import, keeping the dependency graph acyclic. It is deliberately **not** a durable message broker — no retry, no replay, no persistence. Its role is to break mutual-dependency cycles (e.g. product ↔ cart) into a one-way arrow.

## Key elements

- **`DomainEventMap`** — Empty `interface`; each module augments it via TypeScript declaration merging to register its event names → payload types. Intentionally has no members here.
- **`DomainEventName`** — `Extract<keyof DomainEventMap, string>`; the string-union of all declared event names. Exported so `kernel/registry.ts` can cast runtime-discovered names back.
- **`DomainEventMeta`** — Optional `{ eventId?: string }` carried alongside a payload. Only the outbox relay populates it, for deduplication across redeliveries.
- **`onDomainEvent(name, handler)`** — Subscribe a (synchronous or async) handler to a named event. Called from each module's `subscribe()` hook, not at import time.
- **`emitDomainEvent(name, payload, meta?)`** — Dispatch to all subscribed handlers **sequentially** (awaited one after another). A handler that throws is logged via `logger.error` and does not stop the remaining handlers. Returns `true` if every handler resolved, `false` otherwise.
- **`markDomainEventsWired()` / `domainEventsWired()`** — Flag set by `registerModules` after every module's `subscribe()` has run. The outbox relay checks this before dispatching so it never marks a row "published" in a process with no listeners.
- **`resetDomainEvents()`** — Clears all handlers and resets the `wired` flag. A test seam shipped to production; calling it from application code silently unsubscribes every module.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` to record handler failures during `emitDomainEvent`.
- **`src/kernel/outbox.ts`** — Populates `DomainEventMeta.eventId`, reads `domainEventsWired()` before dispatch, and inspects the boolean return of `emitDomainEvent` to decide whether to redeliver a row.
- **`src/kernel/registry.ts`** — `resolvePublicEvents` collects event names from module manifests at runtime; it relies on the `DomainEventName` export for the cast back into `onDomainEvent`'s generic.
- **Module files** (e.g. `modules/cart`, `modules/account`, `modules/api-keys`) — Call `onDomainEvent` in their `subscribe()` hook and `emitDomainEvent` after their own write commits. The cart services (`cleanup.ts`, `merge.ts`) subscribe to product-lifecycle events such as deletion.
- **Integration tests** (e.g. `consent-withdrawal.test.ts`, `backorder.test.ts`) — Exercise the emit→subscribe flow and call `resetDomainEvents()` between cases to avoid handler accumulation.

## Notes

- `DomainEventMap` is a **declaration-merging seam**: adding a new domain event means augmenting the interface in that domain's own file, never editing this one.
- Handlers execute **sequentially, not in parallel**; the emitter awaits the whole cascade. This is a correctness choice (no two listeners race on the same payload), not a performance optimization.
- The `wired` flag is a guardrail, not a feature: without it the outbox could mark a row published in a process where nothing is subscribed, silently losing the event.
- `resetDomainEvents` exists solely for test isolation but is exported to production — there is no runtime guard preventing application code from calling it.
