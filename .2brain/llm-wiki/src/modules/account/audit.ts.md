---
source: src/modules/account/audit.ts
source_sha256: 56009348132b895b6b429d71555f7c662288b77f67118dc95d60a9a79fb826ff
context_sha256: 76eb75c47238aab36530cf6b8215d416a325edef6fad7adaef77c5541cf475a0
generated_at: 2026-11-22T03:19:44.914363+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/audit.ts

## Purpose
Declares the audit action strings the account module emits and registers them with infrastructure's audit action map via TypeScript module augmentation. This lets infrastructure gain the union type without importing upward, and lets the vocabulary grow with the module that owns it. Action strings use an `auth.` prefix, not `account.`, because log tooling and alert rules that predate the module layout query these strings. The folder name can follow the domain while the wire format stays unchanged.

## Key elements
- `accountAuditActions`: a `as const` object mapping event keys (e.g. `AUTH_LOGIN`) to wire strings (e.g. `'auth.login'`). Groups covered:
  - Sign-up, login, logout, logout-all and session revocation.
  - Profile updates and password reset/change.
  - Account deletion: scheduled, canceled, completed, and `AUTH_ERASURES_REAPPLIED` (the restoration log written by `ops:reapply-erasures`).
  - Email verification and the email-change lifecycle: requested, completed, canceled, undone, resent.
  - Refresh-token rotation and reuse detection (`AUTH_REFRESH_TOKEN_REUSE_DETECTED`).
  - Reauthentication and step-up code sending.
  - One-time token rejection (`AUTH_ONE_TIME_TOKEN_REJECTED`).
  - Data export: requested and downloaded.
  - Two-factor: enrolled, disabled, code sent, challenge failed, backup codes regenerated.
  - OAuth: linked, unlinked, failed.
- `declare module '@infrastructure/observability/audit'`: augments `AuditActionMap` with an `account` key whose type is the union of all `accountAuditActions` values.

## Relationships
The neighbors listed are the account services that fire these actions, covering account deletion, email change, the erasure ledger, export, logout, OAuth, password reset (request and completion), password, profile, purge deletions, reauth, refresh, signup and tokens. The file itself imports nothing. The augmentation targets `@infrastructure/observability/audit`.

Some doc comments name the code behind an action: `rotateRefreshToken` fires the reuse-detected action, the purge job fires delete-completed, and `ops:reapply-erasures` fires erasures-reapplied.

## Notes
- The augmentation is type-only. Adding a new action to `accountAuditActions` automatically extends the `AuditActionMap` union.
- Several actions carry documented `metadata` fields. Examples are `via` (`link`, `sign-in` or `staff`) on delete-canceled, `method` on reauth and 2FA enroll/disable, `flow` on one-time-token rejection, and `reused` on export-requested.
- Unknown and expired one-time tokens deliberately produce the same rejection action.
- `AUTH_2FA_CODE_SENT` is called out as the 2FA action an unauthenticated caller can trigger an outbound message with, so its failure series is where mail-bombing attempts would show up.
- Existing wire strings should not be renamed. External log queries and alert rules depend on them.
