---
source: src/modules/account/services/password.ts
sha256: 692cb6cf61ff0e62ba6bcbf43cc31aff49e7cbf1c4ccf4c8c49c3c74941d9edb
generated_at: 2026-10-29T02:42:49.926995+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password.ts

## Purpose

The shared write path for every password change on an account. It validates the new-password pair, rejects breached passwords, writes the new hash and session epoch atomically, revokes old sessions, and (for the signed-in flow) verifies the current password first and sends a post-change notification email. Both the "change while logged in" and "confirm reset link" flows funnel through here so that session revocation is never missed.

## Key elements

- **`validatePasswordChange(password, passwordConfirm)`** — Validates the pair (length/complexity via the shared `SignupBody` schema + match check) using zod. Returns UI error items or an empty array. Pure read; no DB access. Exported so `reset-confirm` can validate *before* spending its one-time token.
- **`PasswordCause`** — Type narrowing of `RevocationCause` to `'password-change' | 'password-reset'`, the only two causes that trigger session revocation.
- **`passwordChange(user, password, passwordConfirm, beforeSave?, cause?)`** — Internal funnel: runs `validatePasswordChange`, then `assertPasswordNotBreached`, then delegates to `writePassword`. Marked `@internal`; only the two public flows should reach it.
- **`writePassword(user, password, beforeSave, cause)`** — The transactional write. Applies the optional `beforeSave` mutation, writes the new hash + bumps the session epoch (via `passwordAndEpochWrite`), optionally announces `account.sessions-revoked` through the outbox in the same transaction, then calls `revokeFor` as post-commit housekeeping. Exported for callers that have already performed their own breach check.
- **`passwordAndEpochWrite(user, password)`** — Private helper that builds the Mongoose transaction callback: `setPassword` → `bumpSessionEpoch`.
- **`notifyPasswordChanged(user, context)`** — Fire-and-forget email via `sendAccountMail`; failure is logged at `warn`, never surfaced to the caller.
- **`passwordChangeWithCurrent(userId, currentPassword, password, passwordConfirm, context)`** — Public entry point for a signed-in user. Validates the new pair *before* the bcrypt compare (cheaper failure path), verifies the current password via `verifyOwnPassword`, delegates to `passwordChange`, records an audit event, and triggers the notification email.

## Relationships

- **`@infrastructure/i18n`** (`t`, context) — Provides translated error messages for validation and wrong-password rejections.
- **`@kernel/outbox`** (`announceInTransaction`) — When the cause announces, the `sessions-revoked` event row is written inside the same DB transaction as the password write.
- **`@infrastructure/runtime/database`** (`withTransaction`) — Wraps the password + epoch write in a Mongoose transaction.
- **`@modules/account/domain/revocation`** (`announces`, `RevocationCause`) — Determines whether the cause requires an outbox announcement; contributes the `PasswordCause` type.
- **`@infrastructure/http/response`** — Supplies `generateSuccess`, `generateReject`, `validationErrors`, and the `Response*` types used throughout.
- **`@infrastructure/adapters/logger`** — Logs a `warn` when the post-change email fails to queue.
- **`@infrastructure/http/errors`** (`rejectDatabaseEnvelope`) — Maps unexpected DB/reject errors into a uniform HTTP envelope.
- **`@infrastructure/security/breached-passwords`** (`assertPasswordNotBreached`) — HIBP-style check run inside `passwordChange` so both callers get it for free.
- **`@infrastructure/observability/audit`** (`recordAudit`) — Records the auth event after `passwordChangeWithCurrent` resolves.
- **`@modules/account/audit`** (`accountAuditActions`) — Provides the `AUTH_PASSWORD_CHANGED` action identifier.
- **`@modules/account/emails`** (`greetableName`, `passwordChangedEmail`, `recipientLocale`) — Builds the notification email content.
- **`@modules/account/services/login`** (`verifyOwnPassword`) — Called by `passwordChangeWithCurrent` to gate on the current password.
- **`@modules/account/services/mail`** (`sendAccountMail`) — Queues the post-change email.
- **`@modules/account/services/index`** — Barrel that re-exports the public surface of this module.

## Notes

- A wrong *current* password returns **422**, not 401. A 401 would be interpreted by client-side auth interceptors as "session expired" and would log the user out unnecessarily.
- The `beforeSave` callback on `passwordChange`/`writePassword` exists so that a caller's extra mutation (e.g., clearing a pending flag) is applied in the *same* write that saves the new password. A rejected password therefore never leaves a half-applied change on the document.
- `revokeFor` failure after a successful write is **swallowed** (logged, not thrown). The session-epoch bump already invalidates old tokens; the purge is defense-in-depth, and failing the whole response over it would be misleading.
- `validatePasswordChange` is deliberately split from `passwordChange` so that `reset-confirm` can validate the pair *before* consuming the one-time reset token — only a well-formed request should get the chance to spend it.
