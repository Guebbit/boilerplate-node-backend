---
source: src/modules/account/events.ts
sha256: 8631a1f79b4da1fc457bf1d4a480bed1ff7e4cb6f92704cd8ea5cc884d7bcc2d
generated_at: 2026-10-29T02:34:24.833297+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/events.ts

## Purpose

Declares the domain events emitted by the account module by augmenting the kernel's `DomainEventMap` interface (via `declare module '@kernel/events'`), so the event catalogue grows per-module without a shared enumeration file. Also re-exports the `SessionsRevokedReason` type and provides runtime string constants for each event name.

## Key elements

- **`declare module '@kernel/events'` block** — adds five entries to `DomainEventMap`:
  - `'account.sessions-revoked'` — `{ userId, reason }`; owner ended all sessions / password-reset / reported unauthorized email change. Subscribed by `api-keys`.
  - `'account.authenticator-removed'` — `{ userId }`; staff member's last authenticator app removed. Subscribed by `api-keys`.
  - `'account.analytics_consent_withdrawn'` — `{ userId }`; owner withdrew analytics consent. Subscribed by `account` itself (GDPR Art. 7(3), 17).
  - `'account.export_failed'` — `{ userId, exportId }`; data export build failed. Subscribed by `tickets` (GDPR Art. 12(3)).
  - `'account.export_ready'` — `{ userId, exportId }`; data export ready; closes a prior failure ticket.
- **`ACCOUNT_SESSIONS_REVOKED`, `ACCOUNT_AUTHENTICATOR_REMOVED`, `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN`, `ACCOUNT_EXPORT_FAILED`, `ACCOUNT_EXPORT_READY`** — exported string constants matching the event keys above, for runtime `emit`/`on` calls.
- **`SessionsRevokedReason`** — re-exported from `./domain/revocation` for downstream consumers that need the union type without importing the domain file directly.

## Relationships

- **`src/modules/account/domain/revocation.ts`** — sole import source; provides the `SessionsRevokedReason` union used as the `reason` field of `account.sessions-revoked`.
- **`src/modules/account/module.ts` / `index.ts`** — module wiring; this file's declarations are part of the account module's public event surface.
- **`src/modules/account/services/revocation.ts`** — emits `account.sessions-revoked` and `account.authenticator-removed` (per event descriptions referencing session-end and authenticator-removal flows).
- **`src/modules/account/services/two-factor-enrollment.ts`** — emits `account.authenticator-removed` when a staff member's last authenticator is removed.
- **`src/modules/account/services/profile.ts`** — emits `account.analytics_consent_withdrawn` when analytics consent flips to `false` during a profile save.
- **`src/modules/account/services/export-job.ts`** — emits `account.export_failed` and `account.export_ready` when an export row transitions state.

## Notes

- All five events are **internal only** — none carries an AsyncAPI channel; no external system receives them.
- Event-name separators are inconsistent: `sessions-revoked` and `authenticator-removed` use a hyphen, while `analytics_consent_withdrawn`, `export_failed`, and `export_ready` use underscores. Code referencing these names must match the exact spelling in the `DomainEventMap` key.
- The string constants duplicate the literal keys; if a key is renamed in the interface the constant must be updated in lockstep (no compile-time link between the two).
