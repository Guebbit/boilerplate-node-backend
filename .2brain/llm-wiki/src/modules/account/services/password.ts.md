---
source: src/modules/account/services/password.ts
sha256: aacf55e3b21735fc8bb6c18073ba19d7f670d23a50bf03c44560ec7dde9acf3e
generated_at: 2026-11-14T18:48:15.519733+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password.ts

## Purpose

Implements the signed-in "change password" flow and the shared write primitive that both the change and reset-confirm paths use. Validates the new-password pair, enforces breach checks, writes the credential inside a transaction (bumping the session epoch and announcing revocation), then revokes stale sessions and notifies the user.

## Key elements

- **`validatePasswordChange(password, passwordConfirm)`** — Pure validation of the new pair (zod bounds + match). Returns UI-facing error items. Exported so reset-confirm can validate *before* spending its one-time token.
- **`passwordChange(user, password, passwordConfirm)`** — Internal write flow: validate → breach check → `withTransaction(passwordWrite)` → `afterPasswordWrite`. Marked `@internal`; only reachable via `passwordChangeWithCurrent`.
- **`passwordWrite(user, password, beforeSave, cause)`** — Returns a transactional write: sets the password, bumps the session epoch, and (when `announces(cause)` is true) queues a `sessions_revoked` outbox row via `announceWithin`. Accepts an optional `beforeSave` hook so reset-confirm can ride its own mutation into the same transaction.
- **`afterPasswordWrite(saved, cause)`** — Post-commit housekeeping: calls `revokeFor` to delete session rows and pending links, then wraps the saved document in a success envelope.
- **`notifyPasswordChanged(user, context)`** — Fire-and-forget email to the account holder; a failed send logs a warning but never rejects the already-committed change.
- **`passwordChangeWithCurrent(userId, currentPassword, password, passwordConfirm, context)`** — Public entry point. Validates the new pair, verifies the current password (via `verifyOwnPassword`), delegates to `passwordChange`, records an audit event, and fires the notification on success.
- **`PasswordCause`** — Type narrowing `RevocationCause` to `'password-change' | 'password-reset'`, the two causes that invalidate live sessions.

## Relationships

- **src/infrastructure/i18n/index.ts** — `t()` for translated validation and mismatch messages.
- **src/infrastructure/i18n/context.ts** — Provides the locale/context plumbing used when composing the notification email via `recipientLocale`.
- **src/kernel/outbox.ts** — `announceWithin` wraps the transactional write to enqueue the session-revocation event atomically; `nudgeOutbox` wakes the relay after commit.
- **src/infrastructure/runtime/database.ts** — `withTransaction` provides the Mongoose client session for the atomic password + epoch write.
- **src/modules/account/domain/revocation.ts** — `announces(cause)` decides whether a revocation event is needed; `RevocationCause` type underpins `PasswordCause`.
- **src/infrastructure/http/response.ts** — `generateSuccess`, `generateReject`, `validationErrors` shape every response envelope.
- **src/infrastructure/http/errors.ts** — `rejectDatabaseEnvelope('auth', …)` converts unexpected DB failures into a standard error response.
- **src/infrastructure/security/breached-passwords/index.ts** — `assertPasswordNotBreached` gates the new password before the write.
- **src/infrastructure/observability/audit.ts** — `recordAudit` logs the outcome (success/failure) of the change.
- **src/modules/account/audit.ts** — Supplies the stable audit action identifiers (e.g. `AUTH_PASSWORD_CHANGED`).
- **src/modules/account/emails.ts** — `passwordChangedEmail`, `greetableName`, `recipientLocale` build the notification email content.
- **src/modules/account/services/login.ts** — `verifyOwnPassword` gates the signed-in flow on proving the current credential.
- **src/modules/account/services/mail.ts** — `sendAccountMail` delivers the fire-and-forget notification.
- **src/modules/account/services/index.ts** — Barrel re-exports this module's public functions for consumers.
- **src/infrastructure/adapters/logger.ts** — Warns on notification-send failure.

## Notes

- **Order is deliberate:** the password write commits *before* sessions are revoked. A revoke that lands against a subsequently-failed write would log everyone out for nothing.
- **422, not 401, for a wrong current password.** A 401 is intercepted by client auth middleware as "session expired" and would tear down a perfectly valid session.
- **Validation precedes bcrypt.** The new pair is checked before `verifyOwnPassword` runs, so a mistyped confirmation costs one round-trip instead of a round-trip plus a hash compare.
- **Breach check lives here, not in reset.** `resetWith` performs its own breach check; `passwordChange` asserts the check belongs to the signed-in path alone.
- **`passwordWrite` is a curried transaction function** (returns `(session) => Promise<…>`), designed to be composed inside `withTransaction` or a caller's larger transaction (reset-confirm).
