---
source: tests/unit/kernel/events.test.ts
sha256: a176de7f34637ce170f9513112e1cbf4c61cc1d11caf3afbf19b51107131d431
generated_at: 2026-09-27T16:11:51.087903+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/events.test.ts

## Purpose

Unit tests for the domain event bus (`@kernel/events`). They lock in the two guarantees the product-delete → cart-emptying flow depends on: the emitter awaits every handler before resolving, and one handler's failure does not propagate to the caller or to sibling handlers.

## Key elements

- **`emitDomainEvent` (tested, not defined here)** — Assertions cover: payload delivery, async ordering (handler completes before `await` resolves), per-handler error isolation, and the boolean return contract (`true` = all settled, `false` = at least one failed).
- **`onDomainEvent`** — Used to register test subscribers.
- **`resetDomainEvents`** — Asserted to drop all subscriptions so handlers don't leak across test cases.
- **`declare module '@kernel/events'`** — Augments `DomainEventMap` with a test-only event `'test.thing-happened'` so the bus can be exercised without polluting the production type.
- **`jest.mock('@infrastructure/adapters/logger')`** — Replaces the real logger with a `jest.fn()` so tests can assert `logger.error` was called with the event name and the original thrown/rejected error.

## Relationships

- **`src/kernel/events.ts`** — The module under test. Provides `emitDomainEvent`, `onDomainEvent`, `resetDomainEvents`, and the `DomainEventMap` interface that the test augments.
- **`src/infrastructure/adapters/logger.ts`** — Mocked. Tests verify that a failed handler's error is forwarded to `logger.error(event-name, error)` rather than being swallowed or re-thrown.

## Notes

- The async-ordering test uses `setImmediate` (a task hop) instead of a timer. A fire-and-forget bus would still push `'emitter'` first via microtask scheduling, so a simple `setTimeout` delay could be fast enough to pass or slow enough to flake; a task hop makes the ordering deterministic.
- The boolean return is the caller's signal: `orders` checks it to decide whether a refund marker should persist. The test asserts both `true` (clean) and `false` (failing) paths independently so a bus that always returned `false` would be caught.
- `afterEach` calls both `resetDomainEvents()` and `jest.clearAllMocks()`; omitting either lets a subscription or a stale mock call leak into the next test.
