# tests/unit/kernel/events.test.ts

## Purpose

Unit tests for the domain event bus. They lock in the two invariants that make the bus a safe *substitute* (not just a decoupling) for the direct products→cart / cart→catalogue calls: handlers are awaited before `emitDomainEvent` resolves, and a single failing handler does not reject the emitter or prevent remaining handlers from running.

## Key elements

- **Module augmentation** (`declare module '@kernel/events'`) — registers a test-only event key `'test.thing-happened'` in `DomainEventMap` so tests can use the typed API without polluting the real domain.
- **`jest.mock('@infrastructure/adapters/logger')`** — replaces the real logger with `{ error: jest.fn() }` so assertions can inspect logged failures without side effects.
- **`afterEach`** — calls `resetDomainEvents()` and `jest.clearAllMocks()` to prevent subscription leakage and stale mock state between tests.
- **`describe('emitDomainEvent')`** — five tests:
  - payload delivery to a subscriber
  - ordering guarantee: `await emitDomainEvent` does not resolve until async handlers finish (uses `setImmediate` to create a measurable task-hop)
  - a synchronous-throwing handler does not block the next handler; error is forwarded to `logger.error`
  - an async-rejecting handler does not reject the emitter; error is forwarded to `logger.error`
  - no-op (resolves `undefined`) when no subscriber is registered
- **`describe('resetDomainEvents')`** — verifies that after a reset, previously registered handlers are no longer invoked.

## Relationships

- **`src/kernel/events.ts`** — the module under test. Imports `emitDomainEvent`, `onDomainEvent`, and `resetDomainEvents`. The test file also extends that module's `DomainEventMap` interface.
- **`src/infrastructure/adapters/logger.ts`** — mocked at module level. The test asserts that failed handler errors reach `logger.error` with the event name and the original `Error`.

## Notes

- The ordering test deliberately uses `setImmediate` (a task hop) rather than a real timer. A fire-and-forget bus would still push `'emitter'` first in that scenario, so the test specifically distinguishes "awaited" from "dispatched-and-forgotten."
- The `DomainEventMap` augmentation is scoped to this file only; it does not modify the production type map at build time.
- `resetDomainEvents` is part of the public API (exported by `src/kernel/events.ts`) and is exercised both as the test isolation mechanism and as the subject of its own describe block.
