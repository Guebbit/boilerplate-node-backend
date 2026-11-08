---
source: tests/unit/kernel/events.test.ts
sha256: 391c38c98c69155eecf6b2d58668392e8d460626ca9a525b6c1da5bce9e9d8b0
generated_at: 2026-11-08T10:26:55.351198+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/events.test.ts

## Purpose

Unit tests for the domain event bus in `@kernel/events`. They pin down the two guarantees the bus must hold for the product-deletion → cart-emptying path and the orders refund-marker path: emissions are awaited before the caller resumes, and a single failing handler cannot propagate as a rejection. Without these tests, a fire-and-forget or single-failure-aborts-all implementation would pass superficial delivery checks while breaking the production flows.

## Key elements

- **`emitDomainEvent` tests** (primary `describe` block) — verify payload delivery, async ordering (handler finishes before emitter continues), sync-throw isolation (returns `false`, next handler still runs), async-rejection isolation (returns `false`, rejects logged), success signal (`true` when all resolve), and no-subscriber no-op (`true`).
- **`resetDomainEvents` test** — confirms that calling the reset drops all subscriptions so handlers do not leak across test cases.
- **Module augmentation** (`declare module '@kernel/events'`) — adds a `'test.thing-happened'` event to `DomainEventMap` purely for this test file; it does not modify the production type.
- **`afterEach` hook** — calls `resetDomainEvents()` and `jest.clearAllMocks()` to isolate each test.
- **Logger mock** — `@infrastructure/adapters/logger` is mocked to a `{ error: jest.fn() }` object; assertions inspect the exact shape of the call (event name in the message, `{ error: … }` key).

## Relationships

- **`src/kernel/events.ts`** — the module under test. The file imports `emitDomainEvent`, `onDomainEvent`, and `resetDomainEvents` from it and augments its `DomainEventMap` interface with a test-only event.
- **`src/infrastructure/adapters/logger.ts`** — mocked via `jest.mock`. Tests assert that handler failures are logged through `logger.error` with the event name in the message and the exception under an `error` key (the key the production logger uses to serialise/drop stack traces).

## Notes

- The `setImmediate`-based ordering test (not a `setTimeout`) is deliberate: it produces a task hop without a measurable delay, making the assertion deterministic against event-loop scheduling. The comment warns that a `setTimeout` version could race or be flaky.
- The return value of `emitDomainEvent` is a **boolean**, not a thrown rejection. `true` means every handler settled; `false` means at least one failed. Production code (e.g. `orders`) branches on this to decide whether a refund marker stays standing.
- The `error` key in the logger call is intentional: the production logger treats that key specially (serialises it, drops the stack in non-debug modes). Tests assert the shape, not the string, so a refactor of the message format won't break them.
- The `declare module` augmentation is scoped to this file's type-check; it does not appear in `tsconfig` or the production build. Adding a new test event here is the intended pattern rather than editing the production map.
