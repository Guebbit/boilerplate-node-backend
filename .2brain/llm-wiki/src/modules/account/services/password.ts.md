---
source: src/modules/account/services/password.ts
sha256: d6a3147723129ff112174ac93d11b498b7d33c7d944c7a8b231c302da2bdc594
generated_at: 2026-10-15T10:01:39.655241+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password.ts

## Purpose

The shared password-write funnel for the account module. Both `completePasswordReset` (in `./password-reset`) and the signed-in change (`passwordChangeWithCurrent`) end at `passwordChange` here, so a new password always gets the breach check, the session-epoch bump, and the session revocation in one place.

## Key elements

- **`validatePasswordChange(password, passwordConfirm)`** — Zod shape check (reusing `SignupBody.shape.password` bounds) plus a match check. Returns `ResponseErrorItem[]`; empty means the pair is acceptable. Exposed so `reset-confirm` can validate *before* spending the one-time token.
- **`passwordChange(user, password, passwordConfirm, beforeSave?, cause?)`** — Main funnel: runs `validatePasswordChange`, then `assertPasswordNotBreached`, then delegates to `writePassword`. Returns `ResponseSuccess | ResponseReject`.
- **`writePassword(user, password, beforeSave?, cause?)`** — The write half, callable when the caller already ran the breach check. Executes `beforeSave` hook, then (in one transaction) sets the password and bumps the session epoch. If `announces(cause)` is true, writes the `account.sessions-revoked` outbox row in that same transaction. After the transaction commits, calls `revokeFor` (failure is logged, not rejected).
- **`passwordAndEpochWrite(user, password)`** — Internal helper that composes `userService.setPassword` + `userService.bumpSessionEpoch` into a single `ClientSession` callback for the transaction.
- **`passwordChangeWithCurrent(userId, currentPassword, password, passwordConfirm, context)`** — Signed-in flow. Validates the new pair first (pure read), then `verifyOwnPassword` (bcrypt), then calls `passwordChange`. Records an audit entry for the outcome.
- **`PasswordCause`** — Type alias: `'password-change' | 'password-reset'`, extracted from `RevocationCause`.

## Relationships

- **`@modules/account/services/login.ts`** — imports `verifyOwnPassword` to gate the signed-in flow on the current password.
- **`@modules/account/services/revocation.ts`** — imports `revokeFor` (purges refresh tokens) and `sessionsRevokedAnnouncement` (builds the outbox payload).
- **`@modules/account/domain/revocation.ts`** — imports `announces` (boolean gate) and the `RevocationCause` type.
- **`@kernel/outbox.ts`** — imports `announceInTransaction` to write the sessions-revoked event inside the password transaction.
- **`@infrastructure/runtime/database.ts`** — imports `withTransaction` for the non-announcing path.
- **`@infrastructure/security/breached-passwords`** — imports `assertPasswordNotBreached` (Have-I-Been-Pwned lookup).
- **`@infrastructure/http/response.ts` / `errors.ts`** — response helpers (`generateSuccess`, `generateReject`, `validationErrors`) and `rejectDatabaseEnvelope` for the catch path.
- **`@infrastructure/i18n`** — `t()` for the "passwords don't match" message.
- **`@infrastructure/observability/audit.ts` + `../audit`** — `recordAudit` + `accountAuditActions.AUTH_PASSWORD_CHANGED` in the signed-in flow.
- **`./password-reset.ts`** (graph neighbor) — calls `writePassword` directly (skipping the breach re-check) or `passwordChange`; this file is its terminal write.
- **`./index.ts`** — re-exports this module's public API.

## Notes

- **422, not 401, for a wrong current password.** A 401 would be interpreted by client interceptors as "session expired" and log out a valid session. The response is intentionally a validation error.
- **Validation order in `passwordChangeWithCurrent`:** new-pair shape/match is checked *before* the bcrypt compare. Both are pure reads, so a mistyped confirmation costs one round-trip instead of a round-trip + bcrypt.
- **`beforeSave` is async-capable and runs inside the transaction, after all refusals.** This guarantees a rejected password never leaves a half-applied mutation on the document. Example use: `markVerified` role promotion (a membership write, not a field mutation).
- **`revokeFor` failure is swallowed (logged).** The password write already committed; a lost revoke is tolerable defense-in-depth, not a caller-facing error.
- **Two export levels for the write:** `passwordChange` (includes breach check) vs. `writePassword` (skips it). `reset-confirm` already ran the breach check before spending the token, so it calls `writePassword` to avoid a redundant HIBP lookup.
- **Session epoch bump and password set share one transaction.** A caller cannot observe the epoch bumped with the old password still in place, or vice-versa.
