---
source: src/modules/account/events.ts
sha256: 7757e55569e4ff6f04192f1d9edddebd84e11d3af143a5749e83db6d41d66632
generated_at: 2026-11-08T04:09:54.419981+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/events.ts

## Purpose

Declares the account module's domain events by augmenting the kernel's `DomainEventMap` interface, so the app-wide event catalogue grows per-module without a shared enumeration file. Also provides the string-constant names used at emit/subscribe sites.

## Key elements

- **`declare module '@kernel/events'`** — Augments `DomainEventMap` with five account-owned event types:
  - `account.sessions_revoked` — `{ userId, reason: SessionsRevokedReason }`; fired on forced logout, password-reset recovery, or disputed email change. Subscriber: `api-keys`.
  - `account.authenticator_removed` — `{ userId }`; fired when a staff member's last authenticator app is removed. Subscriber: `api-keys`.
  - `account.analytics_consent_withdrawn` — `{ userId }`; fired on analytics consent `true → false`. Subscriber: `account` itself (asks the analytics provider to delete the ID).
  - `account.export_failed` — `{ userId, exportId }`; fired when a GDPR data-export build fails. Subscriber: `tasks`.
  - `account.export_ready` — `{ userId, exportId }`; fired when an export row moves to `ready`; closes any earlier failure work.
- **`SessionsRevokedReason`** (type re-export from `./domain/revocation`) — enum/union of the three "possibly compromised" reasons.
- **String constants** — `ACCOUNT_SESSIONS_REVOKED`, `ACCOUNT_AUTHENTICATOR_REMOVED`, `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN`, `ACCOUNT_EXPORT_FAILED`, `ACCOUNT_EXPORT_READY`. Each is the literal event name to use when emitting or subscribing.

## Relationships

- **`src/modules/account/domain/revocation.ts`** — Source of the `SessionsRevokedReason` type consumed by the `sessions_revoked` payload and re-exported here for external consumers.
- **`src/modules/account/services/revocation.ts`** — Emits `account.sessions_revoked` via the constant.
- **`src/modules/account/services/two-factor-enrollment.ts`** — Emits `account.authenticator_removed`.
- **`src/modules/account/services/profile.ts`** — Emits `account.analytics_consent_withdrawn` as part of a profile save.
- **`src/modules/account/services/export-job.ts`** — Emits `account.export_failed` and `account.export_ready` when an export row transitions to `failed` / `ready`.
- **`src/modules/account/index.ts`** — Re-exports the constants (and the type) so downstream modules import from the barrel.
- **`src/modules/account/module.ts`** — Module registration; pairs with this file to bind the event definitions into the running kernel.

## Notes

- All five events are **internal-only**: none has an AsyncAPI channel; nothing outside this application subscribes to them.
- The module-augmentation pattern means you do not edit a central event registry to add or remove an account event—edit this file.
- `account.export_ready` is the *closing* counterpart to `account.export_failed`; a successful retry of a previously failed export emits `ready`, which is what resolves the `tasks` work item opened by `failed`.
- `SessionsRevokedReason` is imported `type`-only and re-exported with `export type`, so it vanishes at compile time; consumers must not value-import it from this file.
