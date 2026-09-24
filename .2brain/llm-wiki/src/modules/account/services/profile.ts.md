---
source: src/modules/account/services/profile.ts
sha256: f067ad93f0d9ff30a769f040bbbfbd7a001a0f66af17a0e5cca79bbc5ac21c97
generated_at: 2026-09-23T18:09:36.895926+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/profile.ts

## Purpose

Service-layer functions for the self-service account profile: reading one's own profile, changing the password (from a reset link or with current-password verification), and hard-deleting one's own account. It sits on the "maintaining" side of the account domain — every flow here mutates an account the caller is already authenticated as, as opposed to `./authentication` which answers "who is this". The password lives here because every write to it is a change to an existing credential, not an entry point.

## Key elements

- **`validatePasswordChange(password, passwordConfirm)`** — Zod-validated check that the two fields match and meet the user-schema password rules. Returns `ResponseErrorItem[]` (empty when valid). Split out so callers can reject *before* spending a one-time reset token.
- **`passwordChange(user, password, passwordConfirm, beforeSave?)`** — Core funnel. Validates → checks breached-passwords → runs optional `beforeSave` hook → `userService.setPassword` → revokes all `REFRESH` tokens (failure swallowed). Returns `ResponseSuccess<UserDocument>` or `ResponseReject`.
- **`getOwnProfile(userId, context)`** — Emits `USER_PROFILE_VIEWED` analytics, then reads via `findByIdWithPendingEmail` (not `getById`) so the caller sees `pendingEmail` status.
- **`passwordResetChange(user, password, passwordConfirm, context)`** — Calls `passwordChange` with `markVerified` as the `beforeSave` hook. On success: fires-and-forgets a `resetConfirmEmail`, records `AUTH_PASSWORD_RESET_COMPLETED` audit row, resolves the actor role via `rolesOf`.
- **`removeOwnAccount(user, context)`** — Captures `email`/`username`/`locale`/`_id` before the hard delete, reads role from the membership store, calls `userService.remove(user, true)`, then on success records audit, emits analytics, and enqueues a goodbye email.

## Relationships

- **`@infrastructure/i18n`** (`t`, `getDefaultLocale`) — localises validation error messages and picks the recipient's locale for outbound mail.
- **`@infrastructure/adapters/mailer`** (`enqueueEmail`) — queues `resetConfirmEmail` / `deleteConfirmEmail` templates (from `../emails`) after successful mutations.
- **`@infrastructure/http/response`** — `generateSuccess`, `generateReject`, `validationErrors` shape every return value.
- **`@infrastructure/http/errors`** (`rejectDatabaseEnvelope`) — wraps unexpected DB failures in `passwordChange`.
- **`@infrastructure/http/schemas`** (`optionalBooleanSchema`) — imported for schema composition (used in the broader request-parsing layer).
- **`@infrastructure/security/breached-passwords`** (`assertPasswordNotBreached`) — consulted in `passwordChange` before the write; a hit returns a 422 reject.
- **`@infrastructure/observability/analytics`** (`emitAnalyticsEvent`, `buildAnalyticsBase`) — self-service analytics events (`USER_PROFILE_VIEWED`, password-change, account-delete).
- **`@infrastructure/observability/audit`** (`recordAudit`) — audit-log rows for reset and delete completions.
- **`@infrastructure/adapters/logger`** (`logger`) — warn-level log when the post-reset audit-role lookup fails.
- **`@modules/access`** (`rolesOf`) — resolves the caller's tenant role for the `actor_role` field on audit rows.
- **`@kernel/permissions`** (`isUnrestrictedRole`) — maps a tenant role to the `'admin'` / `'user'` label used in audit records.
- **`@kernel/access/tenant`** (`DEPLOYMENT_TENANT_ID`) — tenant scoping for the `rolesOf` lookup.
- **`@modules/users`** (`userService`, `zodUserSchema`, `TokenType`, `UserDocument`) — the data-access layer that actually persists password changes, token revocations, and hard deletes.
- **`./verification`** (`markVerified`, `sendVerificationEmail`, `EMAIL_CHANGE_TOKEN_TYPE`) — `markVerified` rides in as the `beforeSave` hook during reset.

## Notes

- **`beforeSave` is deliberately a parameter, not a pre-mutation.** A refused password must not leave a half-applied change on the document; the hook runs only after every validation/breach check has passed and immediately before `save`.
- **Revoke-after-save ordering in `passwordChange`.** If the revoke lands first and the save then fails, every session is logged out for nothing. Conversely, a failed revoke is swallowed (`.catch(() => undefined)`) because the password write already succeeded.
- **`passwordResetChange` marks the address verified; `passwordChangeWithCurrent` does not.** Spending a reset token proves mailbox possession; typing a current password does not.
- **`getOwnProfile` avoids `userService.getById`** for two reasons: (1) `getById` is shared with admin lookups that must not see `pendingEmail`, and (2) an unconditional analytics emit inside `getById` would miscount admin reads as self-views.
- **`removeOwnAccount` captures PII before the write.** After a hard delete the document is gone; the goodbye email and audit row must be composed from the pre-delete snapshot.
- **Fire-and-forget convention.** Post-success side effects (email enqueue, audit role lookup) use `void` or `.catch` so a transient infra failure never turns an already-committed mutation into a 500.
- The module's service is a *folder* (see `./index`), with `profile.ts` as one slice alongside `authentication`, `session`, `verification`, etc.
