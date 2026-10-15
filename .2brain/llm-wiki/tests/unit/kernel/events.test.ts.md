---
source: tests/unit/kernel/events.test.ts
sha256: 391c38c98c69155eecf6b2d58668392e8d460626ca9a525b6c1da5bce9e9d8b0
generated_at: 2026-10-15T13:22:05.867415+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/events.test.ts

## Purpose

Unit tests for the domain event bus (`@kernel/events`). The bus exists to break the product↔cart cycle (products must empty deleted items from carts; carts must read the catalogue to price lines). These tests assert the two safety properties that make that substitution correct: handlers are fully awaited before the emitter resolves, and a failing handler does not take down the emitting operation.

## Key elements

- **`jest.mock('@infrastructure/adapters/logger')`** — stubs the logger so the tests can assert on `logger.error` calls without side effects.
- **`declare module '@kernel/events'`** — augments `DomainEventMap` with a `'test.thing-happened'` event (`{ id: string }`) so the tests are type-safe without touching production types.
- **`afterEach` block** — calls `resetDomainEvents()` and `jest.clearAllMocks()` to prevent subscription leaks between tests.
- **`describe('emitDomainEvent')`** — six tests covering: payload delivery, async-await ordering (handler completes before emitter continues), synchronous throw isolation (resolves `false`, remaining handlers still run), async rejection isolation (resolves `false`, rejection logged), clean-emit signal (resolves `true`), and no-subscriber no-op (resolves `true`).
- **`describe('resetDomainEvents')`** — verifies that after reset, previously registered handlers are no longer invoked.

## Relationships

- **`src/kernel/events.ts`** — the module under test. Provides `emitDomainEvent`, `onDomainEvent`, `resetDomainEvents`, and the `DomainEventMap` interface that the test augments.
- **`src/infrastructure/adapters/logger.ts`** — the event bus calls `logger.error` when a handler throws or rejects; these tests mock it to assert the exact shape of the log payload (event name in the message, `Error` under an `error` key).

## Notes

- The return type of `emitDomainEvent` is a **boolean**, not `void`: `true` means every handler settled successfully, `false` means at least one threw or rejected. Callers (e.g. `orders`) use this to decide whether to keep a refund marker standing.
- The async-ordering test uses `setImmediate` (a task hop) rather than a timer, specifically so a fire-and-forget bus would push `'emitter'` first while a correct await-based bus pushes `'handler'` first — no timing race involved.
- Error logging convention: the `Error` object is placed under an `error` key so the production logger serialises it and drops the stack trace.
- `resetDomainEvents` is both a test-cleanup utility and a public API; the dedicated describe block guards against subscription leakage across test files.
