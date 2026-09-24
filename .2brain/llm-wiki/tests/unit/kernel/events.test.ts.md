---
source: tests/unit/kernel/events.test.ts
sha256: cd6bba64122d1e42bbb6a3c9621c464c175dbee56fad05b6d542a394ddb4f8e3
generated_at: 2026-09-23T20:27:29.038056+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/events.test.ts

## Purpose

Unit tests for the domain event bus (`src/kernel/events.ts`). They lock in two safety properties the product-delete → cart-empty flow depends on: handlers are fully awaited before `emitDomainEvent` resolves, and a single failing handler neither rejects the emission nor prevents remaining handlers from running.

## Key elements

- **`describe('emitDomainEvent')`** — six specs covering: payload delivery, async ordering guarantee (`setImmediate` task hop to distinguish a true await from fire-and-forget), synchronous throw isolation, async rejection isolation, the `true` return on all-success, and the vacuous no-subscriber case.
- **`describe('resetDomainEvents')`** — one spec confirming that after reset, previously registered handlers are no longer invoked.
- **`declare module '@kernel/events'`** — module augmentation adding a `test.thing-happened: { id: string }` entry to `DomainEventMap`, scoped to this test file only.
- **`jest.mock('@infrastructure/adapters/logger', …)`** — replaces the real logger with a `{ error: jest.fn() }` stub so tests can assert on error-logging without side effects.
- **`afterEach`** — calls `resetDomainEvents()` and `jest.clearAllMocks()` to prevent subscription leakage between specs.

## Relationships

- **`src/kernel/events.ts`** — the module under test. The file imports `emitDomainEvent`, `onDomainEvent`, and `resetDomainEvents` directly and asserts their observable behavior (return value, ordering, error propagation).
- **`src/infrastructure/adapters/logger.ts`** — mocked at module level. The only interaction is verifying that `logger.error` is called with the event name and the thrown/rejected `Error` when a handler fails, and that it is _not_ called on a clean emit.

## Notes

- **Return-value contract:** `emitDomainEvent` resolves to `true` (all handlers succeeded or none subscribed) or `false` (at least one handler threw/rejected). It never rejects. Callers like the `orders` module use `false` to keep a refund marker standing.
- **Async-ordering test uses `setImmediate`, not `setTimeout`** — a zero-delay timer would still let a fire-and-forget bus interleave; `setImmediate` guarantees the handler's continuation is queued _after_ the emitter's await resumes, making the test deterministic without timing sensitivity.
- **`declare module` augmentation is file-scoped.** The `test.thing-happened` key exists only within this test's type graph; other files do not see it.
- **No integration or concurrency tests here.** This file validates single-emitter, single-tick behavior only.
