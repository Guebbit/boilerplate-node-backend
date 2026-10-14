---
source: src/modules/account/services/password.ts
sha256: 95c5f1a14b955d75e29bc3806857c7f3b9a38e93a0aba761501af905e1ced0b1
generated_at: 2026-10-14T08:51:07.524655+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password.ts

## Purpose

Shared write-path for every password change in the account module. Validates the new-password pair, checks the password against the breached-password corpus, atomically writes the new hash and bumps the session epoch, optionally emits a revocation event via the outbox, and purges refresh tokens. Also exposes the signed-in flow (`passwordChangeWithCurrent`) that gates the change on verifying the current password.

## Key elements

- **`validatePasswordChange(password, passwordConfirm)`** – Exported. Validates shape (via `SignupBody.shape.password`) and match between the two fields using Zod `safeParse`. Returns `ResponseErrorItem[]`; empty means acceptable. Intentionally split out so `password-reset` can validate *before* consuming the one-time token.
- **`passwordChange(user, password, passwordConfirm, beforeSave?, cause?)`** – Exported. The funnel both reset and signed-in flows call. Validates the pair, runs `assertPasswordNotBreached`, then delegates to `writePassword`.
- **`writePassword(user, password, beforeSave?, cause?)`** – Exported. Transactional write: runs optional `beforeSave` hook, sets the password and bumps the session epoch in one Mongoose transaction, atomically announces `account.sessions-revoked` via outbox when the cause requires it, then calls `revokeFor`. Exported separately so callers that have already validated can skip the breach re-check.
- **`passwordChangeWithCurrent(userId, currentPassword, password, passwordConfirm, context)`** – Exported. The signed-in endpoint handler. Validates the new pair first (cheaper), then calls `verifyOwnPassword` from `./login`, delegates to `passwordChange`, and records an audit entry.
- **`passwordAndEpochWrite`** – Internal. Builds a Mongoose `ClientSession`-scoped write that calls `userService.setPassword` then `userService.bumpSessionEpoch`.
- **`PasswordCause`** – Type alias narrowing `RevocationCause` to `'password-change' | 'password-reset'`.

## Relationships

- **`./login`** – `passwordChangeWithCurrent` calls `verifyOwnPassword` to gate the change on the current password.
- **`./revocation`** – `writePassword` calls `revokeFor` (post-transaction purge) and builds the outbox payload via `sessionsRevokedAnnouncement`.
- **`../domain/revocation`** – Imports `announces` (decides whether the cause emits an outbox event) and the `RevocationCause` type.
- **`@kernel/outbox`** – `announceInTransaction` wraps the write so the `sessions-revoked` event commits atomically with the password change.
- **`@infrastructure/runtime/database`** – `withTransaction` provides the Mongoose transaction when no outbox announcement is needed.
- **`@infrastructure/security/breached-passwords`** – `assertPasswordNotBreached` is the single breach-check both callers share.
- **`@infrastructure/http/response`** – `generateSuccess`, `generateReject`, `validationErrors`, and response types shape every return value.
- **`@infrastructure/http/errors`** – `rejectDatabaseEnvelope` wraps unexpected exceptions into the standard error envelope.
- **`@infrastructure/i18n`** – `t` provides translated error messages (e.g. password-don't-match).
- **`@infrastructure/observability/audit`** + **`../audit`** – `recordAudit` with `accountAuditActions.AUTH_PASSWORD_CHANGED` logs the signed-in flow's outcome.
- **`@modules/users`** – `userService.setPassword` / `bumpSessionEpoch` perform the actual document writes.

## Notes

- **Order is deliberate:** the password write commits *before* the token purge runs. If the purge fails it is logged, not surfaced — the epoch bump already invalidates old tokens, so a lost purge is an acceptable degradation.
- **`beforeSave` hook** runs inside the same transaction, before the password is set. This guarantees a rejected password (e.g. breach check) never leaves a half-applied caller mutation on the document.
- **422, not 401, for a wrong current password.** A 401 would be interpreted by client interceptors as "session expired" and would log out a valid session.
- **Validation precedes bcrypt.** In `passwordChangeWithCurrent`, the new-pair validation runs before `verifyOwnPassword`, so a mistyped confirmation costs one round-trip instead of a round-trip plus a hash compare.
- **`validatePasswordChange` is split out** specifically so `./password-reset` can validate the pair *before* spending the one-time reset token; only a well-formed request should get the chance to consume it.
