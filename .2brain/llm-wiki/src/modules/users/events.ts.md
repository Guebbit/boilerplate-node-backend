---
source: src/modules/users/events.ts
sha256: d94fb56886bbbf000fc54b7c44ca4d2bc93d0dbdebcec0dcc5586a0e7b0cb889
generated_at: 2026-10-29T06:12:29.978995+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/events.ts

## Purpose

Declares the domain events emitted by the `users` module and registers their payload types into the kernel's app-wide `DomainEventMap` via TypeScript module augmentation. This keeps the event catalogue distributed across owning modules rather than enumerated in a shared file.

## Key elements

- **`UserChangedField`** (type) — Union of the five personal-data fields (`username`, `email`, `phone`, `website`, `imageUrl`) whose change is announced by `user.profile_changed`. Excludes preferences like locale/consent.
- **Module augmentation of `@kernel/events`** — Adds seven event names and their payload shapes to `DomainEventMap`:
  - `user.setup-requested` — admin created a user with a queued password (subscriber: `account`)
  - `user.deactivated` — admin banned an account, sessions ended (subscriber: `account`)
  - `user.deletion-cancelled` — staff restored a scheduled erasure (subscriber: `account`)
  - `user.erased` — account hard-deleted; `users` itself requests GDPR Art. 17 analytics purge
  - `user.profile_changed` — a personal-data field was rectified; carries `changed: UserChangedField[]` (names only, never values); feeds the `user.updated` webhook (GDPR Art. 19)
  - `user.review_flagged` — shop rule flagged an account for staff review (subscriber: `tickets`); internal only
  - `user.review_cleared` — staff resolved the flag with hold or lift (subscriber: `tickets`); internal only
- **Seven string constants** (`USER_SETUP_REQUESTED`, `USER_DEACTIVATED`, `USER_DELETION_CANCELLED`, `USER_ERASED`, `USER_PROFILE_CHANGED`, `USER_REVIEW_FLAGGED`, `USER_REVIEW_CLEARED`) — Stable string identifiers for each event, intended for use by emitters and subscribers without re-typing the literal.

## Relationships

- **Emitters (services):** `services/create.ts`, `services/activation.ts`, `services/credentials.ts`, `services/purchase-hold.ts`, `services/remove.ts`, and `services/update.ts` are the in-module callers that commit these events in their respective write transactions.
- **Re-export / wiring:** `index.ts` and `module.ts` expose the constants and wire the events into the module's public surface.
- **Tests:** `tests/unit/public-events.test.ts` validates the exported constants; `tests/integration/service.test.ts` and `tests/contract/api.contract.test.ts` verify that services emit the correct payloads and that the API contract matches.

## Notes

- Field names in `user.profile_changed` are intentionally limited to the set defined in `services/audit-changes.ts`; they never carry values, keeping the outbox row and delivery log replayable.
- `user.review_flagged` and `user.review_cleared` are internal-only — no AsyncAPI channel carries them — so external consumers must not rely on receiving them.
- `user.setup-requested` is emitted once per flag-set; the automatic purchase-hold has its own separate staff notice and is not announced through this event.
