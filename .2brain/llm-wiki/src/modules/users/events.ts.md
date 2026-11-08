---
source: src/modules/users/events.ts
sha256: 31bf4919edb04fda0d72f0bc8600f94916ce48f64bd94537d6e8f4b416566b92
generated_at: 2026-11-08T08:45:48.579748+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/events.ts

## Purpose

Declares the domain event payloads owned by the users module by augmenting the kernel's `DomainEventMap` (via `declare module '@kernel/events'`), so the global event catalogue grows per-module without a shared enumeration file. Also exports the string constants used to reference each event name at emit sites.

## Key elements

- **`UserChangedField`** — Union type (`'username' | 'email' | 'phone' | 'website' | 'imageUrl'`) listing the personal-data fields whose change is announced. Excludes preferences (locale, consent) by design.
- **`DomainEventMap` augmentation** — Registers seven events with their payload shapes:
  - `user.setup_requested` — `{ userId }` — admin created a user without a password; `account` subscribes.
  - `user.deactivated` — `{ userId }` — admin banned an account; `account` purges one-time links.
  - `user.deletion_canceled` — `{ userId, canceledAt }` — staff restored a scheduled-erasure account; `account` drops the link and mails the owner.
  - `user.erased` — `{ userId }` — hard-delete committed; `users` itself calls the analytics provider to forget the id (GDPR Art. 17).
  - `user.profile_changed` — `{ userId, changed: UserChangedField[] }` — field-level rectification; no in-process subscriber, exists for the `user.updated` webhook (GDPR Art. 19).
  - `user.review_flagged` — `{ userId }` — shop rule flagged an account for staff review; `tasks` opens a review task. Internal only.
  - `user.review_cleared` — `{ userId }` — staff acted on the flag (hold or lift); `tasks` closes the task. Internal only.
- **String constants** — `USER_SETUP_REQUESTED`, `USER_DEACTIVATED`, `USER_DELETION_CANCELED`, `USER_ERASED`, `USER_PROFILE_CHANGED`, `USER_REVIEW_FLAGGED`, `USER_REVIEW_CLEARED`: each is the literal event-name string, re-exported for import at emit sites.

## Relationships

- **Services (emitters):** `services/create.ts` emits `user.setup_requested`; `services/activation.ts` emits `user.deactivated`; `services/remove.ts` emits `user.deletion_canceled` and `user.erased`; `services/update.ts` emits `user.profile_changed`; `services/purchase-hold.ts` emits `user.review_flagged` / `user.review_cleared`.
- **`src/modules/users/index.ts`** — re-exports the constants and type so external importers need only the module barrel.
- **`src/modules/users/module.ts`** — registers the module; the events declared here are the contract it publishes.
- **Tests:** `tests/unit/public-events.test.ts` verifies the public event surface; `tests/integration/service.test.ts` and `tests/contract/api.contract.test.ts` exercise the events in context.

## Notes

- Events are committed **with** the domain save (same transaction), not emitted after — the outbox row and the data change are atomic.
- `user.profile_changed` carries **field names only, never values**, so the outbox row is replayable and the delivery log stays safe.
- `user.review_flagged` and `user.review_cleared` are internal: no AsyncAPI channel carries them.
- `canceledAt` on `user.deletion_canceled` is the real-world timestamp of the cancellation, not handler-execution time — the erasure ledger dates its row by it.
- The augmentation pattern means adding a new users event requires editing only this file; no shared registry needs updating.
