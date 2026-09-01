# src/kernel/events.ts

## Purpose

A minimal in-process domain event bus that lets modules communicate without importing each other, preserving the acyclic dependency graph enforced by `.dependency-cruiser.cjs`. It is explicitly *not* a durable broker: no persistence, no retry, no replay.

## Key elements

- **`DomainEventMap`** — An intentionally empty interface used as a declaration-merging seam. Each module augments it with its own event-name → payload mappings; the file itself defines no members.
- **`DomainEventName`** — A string-literal union derived from `keyof DomainEventMap`.
- **`DomainEventHandler<TEventName>`** — A handler type narrowed to a specific event's payload.
- **`onDomainEvent(name, handler)`** — Registers a handler for a given event name. Intended to be called from a module's `subscribe()` hook, not at import time.
- **`emitDomainEvent(name, payload)`** — Emits an event. All registered handlers are awaited **sequentially** (ordering is a guarantee). A handler that throws is logged via `logger.error` and does not stop subsequent handlers or the caller.
- **`resetDomainEvents()`** — Clears the entire handler map. A test seam for isolation between test cases; shipped to production with the acknowledged risk that application code could call it and silently unsubscribe every module.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imported directly; used to log handler failures inside `emitDomainEvent`.
- **Module files (`account`, `cart`, `delivery`, `inventory`, `orders`, `payments`)** — Augment `DomainEventMap` via TypeScript declaration merging, call `onDomainEvent` in their `subscribe()` hooks, and call `emitDomainEvent` to notify other modules of domain state changes.
- **Integration test files (e.g. `cart/tests/integration/service.test.ts`, `orders/tests/integration/cancel.test.ts`)** — Call `resetDomainEvents()` between test cases to prevent handler accumulation across suites.

## Notes

- `DomainEventMap` is empty by design; do not add event names here. Each domain owns its own entries (see `modules/products/events.ts` for the pattern).
- Sequential, awaited handler execution is intentional: emitters rely on the side-effect having completed (e.g., product removed from all carts *before* deletion from the database). Do not convert to `Promise.all`.
- `resetDomainEvents` exists in production code solely for tests. Call it in application code at your own risk.
- Subscribe in the `subscribe()` lifecycle hook, never at top-level import, so the active handler set is controlled by `src/modules.ts` rather than import order.
