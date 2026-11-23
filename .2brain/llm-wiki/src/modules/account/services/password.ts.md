---
source: src/modules/account/services/password.ts
source_sha256: 124985e5a963457cdce293ef623296d883a373f113318db2262ce6e93176a5ae
context_sha256: cf458e825f7b93721fbaf8eeaa81c2da764efe45444c6b720834885a569243af
generated_at: 2026-11-22T03:39:38.352033+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/password.ts

## Purpose
Implements changing an account's password. It holds the write that both the signed-in change and the reset flow share, and the signed-in change that first proves the current password. Reset links themselves live in `./password-reset`.

## Key elements
- `validatePasswordChange(password, passwordConfirm)` — a pure zod check that returns UI-facing error items (empty when valid). `password` reuses `SignupBody.shape.password`. The only extra rule is that the two values match, with the message `account.signup.password-dont-match`. It is split out so `reset-confirm` can validate before spending its one-time token.
- `passwordChange(user, password, passwordConfirm)` — validates, rejects a breached password with a 422, then writes in a transaction and runs the post-commit housekeeping. It is marked `@internal` because it does not check the current password.
- `passwordWrite(user, password, beforeSave, cause)` — returns a `(session) => Promise<UserDocument>` for use inside a transaction. It runs the optional `beforeSave` mutation, calls `accountUserService.setPassword`, then `bumpSessionEpoch`. If `announces(cause)` is true, it wraps the write in `announceWithin` to add an `account.sessions_revoked` outbox row (`sessionsRevokedAnnouncement`).
- `afterPasswordWrite(saved, cause)` — runs `revokeFor(cause, saved.id)` to purge session rows and pending links, then returns `generateSuccess(saved)`.
- `passwordChangeWithCurrent(userId, currentPassword, password, passwordConfirm, context)` — the public signed-in entry point:
  1. Validates the new pair.
  2. Checks the current password with `verifyOwnPassword`.
  3. Delegates to `passwordChange`.
  4. Records an audit entry (`AUTH_PASSWORD_CHANGED`, success or failure).
  5. On success, sends a notification email.
- `notifyPasswordChanged` (private) — queues a "password changed" email through `sendAccountMail`. It is fire-and-forget and logs a warning if queueing fails.
- `PasswordCause` (private type) — `'password-change' | 'password-reset'`.

## Relationships
- `./login` — supplies `verifyOwnPassword`, used to check the current password.
- `./mail` — supplies `sendAccountMail`, used for the notice. `../emails` supplies `passwordChangedEmail`, `greetableName` and `recipientLocale`.
- `./revocation` and `../domain/revocation` — `revokeFor`, `sessionsRevokedAnnouncement`, `announces` and the `RevocationCause` type.
- `@kernel/outbox` — `announceWithin` and `nudgeOutbox` handle the outbox row and the relay wake-up.
- `@infrastructure/runtime/database` — `withTransaction`.
- `@infrastructure/security/breached-passwords` — `assertPasswordNotBreached`.
- `@infrastructure/http/response` and `@infrastructure/http/errors` — response builders and `validationErrors`; `rejectDatabaseEnvelope('auth', …)` converts database errors into reject envelopes.
- `@infrastructure/i18n` — `t` translates the mismatch message.
- `@infrastructure/observability/audit` with `../audit` — `recordAudit` and `accountAuditActions`.
- `@infrastructure/adapters/logger` — logs email-queue failures.
- `@modules/users/friends/account` — `accountUserService` provides `setPassword` and `bumpSessionEpoch`.

## Notes
- Save first, revoke second: a revoke followed by a failed write would log everyone out for nothing.
- A wrong current password returns 422 with translated copy, not 401. A 401 would look like an expired session to client interceptors and log out a valid session.
- The new pair is validated before the current password is checked, so a mistyped confirmation avoids a bcrypt compare.
- `nudgeOutbox()` is called only after the commit and only when the cause announces. The reset flow wakes the relay itself.
- `revokeFor` failures are logged, not turned into a 500, because the bumped session epoch already refuses old tokens.
- `passwordChange` runs the breach check. The reset flow does its own in `resetWith`.
- The caller re-mints its own session afterwards (`postPasswordChange`, `issueSession`).
