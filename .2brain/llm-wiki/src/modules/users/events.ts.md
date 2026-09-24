---
source: src/modules/users/events.ts
sha256: 3b8d588531bcbeda7c3482b9fa18d253b6f245d44c79e47c07c5374fbbae854e
generated_at: 2026-09-23T19:32:35.924864+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/events.ts

## Purpose

Declares the two domain events the users module emits by augmenting the kernel's `DomainEventMap` via TypeScript declaration merging. This keeps the event catalogue distributed—each module contributes its own payloads without a single shared registry file—and provides one canonical string per event name for emitters and listeners to share.

## Key elements

- **`DomainEventMap` augmentation** (`declare module '@kernel/events'`): Adds two typed payload entries to the kernel's global event map.
  - `user.deleted` — `{ userId: string }`. Emitted (and awaited) *before* the hard-delete write so subscribers observe a consistent database.
  - `user.setup-requested` — `{ userId: string }`. Emitted when an admin creates a password-less user and queues a setup request; the `account` module is the intended subscriber.
- **`USER_DELETED`** — `const = 'user.deleted'`. Exported barrel constant so the emitter and any listener reference one symbol instead of two independent string literals.
- **`USER_SETUP_REQUESTED`** — `const = 'user.setup-requested'`. Same pattern; see `DomainEventMap['user.setup-requested']`.

## Relationships

- **`src/users/index.ts` (barrel)** — Re-exports `USER_DELETED` and `USER_SETUP_REQUESTED` so consumers import from the module root rather than reaching into `events.ts`.
- **`src/users/service.ts`** — The emitter. Calls `userService.create` (referenced in the `user.setup-requested` doc) and the hard-delete path that fires `user.deleted`.
- **`src/users/module.ts`** — Module bootstrap; the natural place where the module wires listeners for these events into the kernel's event bus.
- **`src/users/tests/integration/service.test.ts`** — Integration tests that exercise the service paths which emit these events.

## Notes

- **Soft delete is intentionally silent.** Only the irreversible hard-delete emits; a soft delete is reversible, and cleanup on it would make a later restore lossy.
- **Ordering contract.** `user.deleted` is emitted *and awaited* before the `DELETE` write. Listeners must not assume the row is already gone when they run.
- **Cross-module subscription.** `user.setup-requested` is consumed by the `account` module (tokens + outbound email), not by the users module itself—subscribers must be registered where `account` is mounted.
- **Declaration merging, not a shared file.** Adding a new event here does not require touching `@kernel/events` source; the `interface DomainEventMap` merge is the only coupling point.
