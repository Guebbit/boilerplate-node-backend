---
source: src/kernel/events.ts
source_sha256: e3ddfa3a521018d6c2d17b8a9f86dcd69b8d4f263732baa7df7a5fff29a728af
context_sha256: b21dc06f8652c108d8db1ba21c4a9b668fd0c841162a10b66a078bb125a54e22
generated_at: 2026-11-22T03:12:52.481272+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/events.ts

## Purpose
In-process domain event bus. It lets two modules communicate when neither can import the other (the import graph must stay acyclic), so the dependency arrow points one way via an event rather than an import. It is explicitly not a broker: no durability, retry, or replay.

## Key elements
- `DomainEventMap`, `DomainEventName` (type re-exports from `@types`): event name → payload map and the name union. They are generated from `asyncapi.yaml` (`domain-events` section), so new events are declared there, never in this file.
- `DomainEventMeta`: metadata passed beside the payload. It has an optional `eventId`, the stable outbox row id, which lets consumers dedupe redeliveries. It is absent for a plain emit.
- `onDomainEvent(name, handler)`: subscribes a handler (sync or async) to an event, in subscription order. Intended to be called from a module's `subscribe()` hook, not at import time.
- `emitDomainEvent(name, payload, meta = {})`: runs the handlers sequentially, awaiting each. A throwing handler is logged via `logger.error` and doesn't stop later handlers or the emitter. It returns `true` if all handlers resolved and `false` if any threw.
- `markDomainEventsWired()` / `domainEventsWired()`: set and read a process-local `wired` flag. `registerModules` sets it after every module's `subscribe()` has run.
- `resetDomainEvents()`: clears all handlers and the wired flag. It is a test seam.

## Relationships
- `src/infrastructure/adapters/logger.ts`: provides the `logger` used to report handler failures.
- `src/kernel/outbox.ts`: the outbox relay is the only caller that passes `meta` (`eventId`). It uses the boolean return to decide whether to redeliver a row, and reads `domainEventsWired()` so it doesn't dispatch into a process with no subscribers and mark the row published.
- `src/kernel/registry.ts`: `registerModules` calls `markDomainEventsWired()` after the `subscribe()` hooks run. `resolvePublicEvents` learns event names at runtime and casts them to `DomainEventName` before calling `onDomainEvent`.
- Module files (`src/modules/account/module.ts`, `src/modules/api-keys/module.ts`, `src/modules/cart/module.ts`, plus the `events.ts` files in account and cart, and `src/modules/cart/services/cleanup.ts`): the neighbor list shows these are connected to the bus. The visible source doesn't show how each one uses it, though the doc comments say modules subscribe through their `subscribe()` hooks.
- The account and api-keys integration tests are also neighbors. `resetDomainEvents()` exists as a test seam so suites that register modules per case don't accumulate handlers.

## Notes
- Handlers run sequentially and are awaited, so listeners on one payload never race. Emitters like `products` fire past-tense events (e.g. `product.deleted`) only after their own write lands.
- A failing listener never rolls back an already-authorised operation, and the emitter ignores the boolean unless it needs it (as the outbox relay does).
- `resetDomainEvents()` ships in production code, so application code could call it and silently unsubscribe every module.
- Handlers are stored in a module-level `Map`, so the state is per process.
- Do not add new event types here. Declare them in the AsyncAPI files.
