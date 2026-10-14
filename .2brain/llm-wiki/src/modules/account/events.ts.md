---
source: src/modules/account/events.ts
sha256: 734c7f32e19c6e24ba6ffee6cf945f4a2a95c7e2017dd73e6c51e13b02a4857e
generated_at: 2026-10-14T08:40:04.883632+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/events.ts

## Purpose
Declares the domain events the account module emits by augmenting the kernel's `DomainEventMap` via TypeScript module declaration merging. This keeps the event catalogue distributed across owning modules rather than centralised in a shared file.

## Key elements
- **Module augmentation of `@kernel/events`** — adds the `account.sessions-revoked` entry to `DomainEventMap` with payload `{ userId: string; reason: SessionsRevokedReason }`.
- **`SessionsRevokedReason`** (re-export) — the union/discriminant type for *why* all sessions were revoked (logout-everywhere, password-recovery, reported email change). Sourced from `./domain/revocation`.
- **`ACCOUNT_SESSIONS_REVOKED`** — a string-constant (`'account.sessions-revoked'`) for ergonomic referencing of the event name without repeating the literal.

## Relationships
- **`src/modules/account/domain/revocation.ts`** — provides the `SessionsRevokedReason` type that forms part of this event's payload. Re-exported here so consumers can import it from the events surface.
- **`src/modules/account/services/revocation.ts`** — the service that triggers the `account.sessions-revoked` event (e.g. on logout-everywhere, password-reset recovery, or email-change denial).
- **`src/modules/account/index.ts`** — barrel re-export; makes this file's exports available to the wider module surface.

## Notes
- The event is **internal only**: no AsyncAPI channel carries it, and nothing outside the application subscribes via an external broker. The known in-app subscriber is the `api-keys` module (revokes long-lived keys, which outlive sessions).
- Adding a new event to the account module means extending the `DomainEventMap` interface in this file — there is no separate registration step or shared enum to update.
