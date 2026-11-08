---
source: src/modules/account/services/password.ts
sha256: 2eaaf9797b402ab459f0012560732f1d28b987a6905b688b6970ff1029bfa4e2
generated_at: 2026-11-08T04:20:32.826563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password.ts

## Purpose
The single write-path for changing a user's password. Both the signed-in "change password" flow (`passwordChangeWithCurrent`) and the reset-confirm flow funnel through `passwordChange` / `writePassword`, guaranteeing that every credential update bumps the session epoch, revokes refresh tokens, and (when the cause announces) emits an `account.sessions_revoked` outbox row — all inside one database transaction.

## Key elements

- **`validatePasswordChange(password, passwordConfirm)`** — Pure validator for the new-password pair (zod shape from `SignupBody` + match check). Returns `ResponseErrorItem[]`; empty means acceptable. Extracted so the reset flow can validate *before* spending a one-time token.
- **`passwordChange(user, password, passwordConfirm, beforeSave?, cause?)`** — Entry point that runs `validatePasswordChange`, then `assertPasswordNotBreached`, then delegates to `writePassword`. Marked `@internal`; only the reset flow and `passwordChangeWithCurrent` should call it.
- **`writePassword(user, password, beforeSave?, cause)`** — The transactional write: applies `beforeSave` mutation (if any), sets the password, bumps the session epoch, and conditionally enqueues a revocation announcement via `announceInTransaction`. Followed by a best-effort `revokeFor` purge (failure is logged, not thrown).
- **`passwordChangeWithCurrent(userId, currentPassword, password, passwordConfirm, context)`** — Public signed-in flow. Validates the new pair, verifies the current password via `verifyOwnPassword`, then calls `passwordChange`. Records an audit entry and fires a best-effort "password changed" email on success.
- **`PasswordCause`** — `Extract<RevocationCause, 'password-change' | 'password-reset'>`; selects which revocation/announcement behavior applies.
- **`notifyPasswordChanged(user, context)`** — Fire-and-forget email via `sendAccountMail`; failures only produce a `logger.warn`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/login.ts` | Imports `verifyOwnPassword` to gate the signed-in change on the current credential. |
| `src/modules/account/services/mail.ts` | Imports `sendAccountMail` for the post-change notification. |
| `src/modules/account/emails.ts` | Imports `greetableName`, `passwordChangedEmail`, `recipientLocale` to compose that email. |
| `src/modules/account/domain/revocation.ts` | Imports `announces` (decides whether to write an outbox row) and the `RevocationCause` type. |
| `src/modules/account/audit.ts` | Imports `accountAuditActions` for the audit-event constant. |
| `src/kernel/outbox.ts` | Imports `announceInTransaction` to atomically emit `account.sessions_revoked` in the same transaction as the password write. |
| `src/infrastructure/runtime/database.ts` | Imports `withTransaction` to wrap the write when no announcement is needed. |
| `src/infrastructure/security/breached-passwords/index.ts` | Imports `assertPasswordNotBreached` to reject known-breached passwords before writing. |
| `src/infrastructure/http/response.ts` | Imports `generateSuccess`, `generateReject`, `validationErrors`, and the response type aliases. |
| `src/infrastructure/http/errors.ts` | Imports `rejectDatabaseEnvelope` to shape database-level failures. |
| `src/infrastructure/i18n/index.ts` | Imports `t()` for the "passwords don't match" message. |
| `src/infrastructure/observability/audit.ts` | Imports `recordAudit` to log the auth event. |
| `src/infrastructure/adapters/logger.ts` | Imports `logger` for the warn-level catch on mail failure. |

## Notes

- **422, not 401, for a wrong current password.** A 401 would be interpreted by client interceptors as "session expired" and would log out a valid session.
- **Ordering guarantee:** save → revoke. A revoke that fires against a write that subsequently rolls back would log everyone out for nothing.
- **`revokeFor` failure is intentionally swallowed** (logged, not re-thrown): the password is already persisted; losing the purge is acceptable defense-in-depth.
- **`beforeSave` is a callback, not a pre-mutation.** It runs inside the same write path so a rejected password never leaves a half-applied document. Callers (e.g. the reset flow clearing a reset token) must pass it rather than mutating `user` before calling.
- **Validation-before-verification:** the new-password pair is shape-checked *before* the bcrypt compare in `passwordChangeWithCurrent`, so a mistyped confirmation costs only one round-trip.
- **`notifyPasswordChanged` is fire-and-forget.** A transient mail-queue outage must not turn a successful password change into an error response.
