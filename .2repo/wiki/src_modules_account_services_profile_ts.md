# src/modules/account/services/profile.ts

## Purpose

Self-service account maintenance: reading, updating, and hard-deleting the caller's own profile, plus password changes (reset-link and live-session). Sits on the "maintain an identity" side of the account split; `./authentication` handles "prove an identity". Password lives here because every flow that writes one (reset link, logged-in change) is a mutation of an existing account, not a gate into it.

## Key elements

- **`validatePasswordChange`** – Zod-validates a password/confirm pair in isolation; returns i18n error items or `[]`. Split out so `reset-confirm` can reject a bad body *before* spending the one-time token.
- **`passwordChange`** – Validates then writes `user.password` via `userRepository.save`; returns 422 reject or 200 success.
- **`getOwnProfile`** – Reads a user by id through `userService.getById`, emitting `USER_PROFILE_VIEWED` analytics. Wrapper (not an emit inside `getById`) so the admin lookup path doesn't count as a self-view.
- **`passwordResetChange`** – Delegates to `passwordChange`; on success emits `AUTH_PASSWORD_RESET_COMPLETED` audit, `ACCOUNT_DELETED`-style analytics, and fire-and-forget enqueues the reset-confirmation email.
- **`removeOwnAccount`** – Snapshots email/username/locale **before** calling `userService.remove(user, true)`; on success emits `AUTH_ACCOUNT_DELETE_COMPLETED` audit, `ACCOUNT_DELETED` analytics, and enqueues the goodbye email.
- **`zodProfileSchema`** *(internal)* – Partial schema for `PUT /account`: `email`, `username` (i18n thunks from `zodUserSchema`) + `locale`, `imageUrl` (from `UpdateAccountBody`).
- **`updateProfile`** – Validates with `zodProfileSchema`, loads the doc with credentials, sets `verified = false` if email changed, persists via `userService.update`; emits `AUTH_PROFILE_UPDATED` audit on success. E11000 duplicates surface as 409 through `rejectDatabaseEnvelope`.
- **`passwordChangeWithCurrent`** *(truncated in source)* – Live-session password change gated on the current password; reuses `passwordChange` as its final step.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@modules/users` | Reads `zodUserSchema`, `userRepository`, `userService`, `UserDocument` type. |
| `@infrastructure/adapters/mailer` | `enqueueEmail` called (fire-and-forget) in `passwordResetChange` and `removeOwnAccount`. |
| `@modules/account/emails` | `resetConfirmEmail` / `deleteConfirmEmail` build the template + data passed to the mailer. |
| `@infrastructure/http/response` | `generateSuccess`, `generateReject`, `validationErrors`, response type aliases. |
| `@infrastructure/http/errors` | `rejectDatabaseEnvelope('auth', err)` for Mongoose cast/save failures. |
| `@infrastructure/http/request` | `CallerContext` type (carries locale, auth identity for audit/analytics base). |
| `@infrastructure/i18n` | `t()` for inline messages; `getDefaultLocale()` as last-resolve locale. |
| `@infrastructure/observability/analytics` | `emitAnalyticsEvent` / `buildAnalyticsBase` in `getOwnProfile`, `passwordResetChange`, `removeOwnAccount`. |
| `@infrastructure/observability/audit` | `emitAuditEvent` / `buildAuditEvent` in `passwordResetChange`, `removeOwnAccount`, `updateProfile`. |
| `@modules/account/analytics` | `accountAnalyticsEvents` enum (event names). |
| `@modules/account/audit` | `accountAuditActions` enum (action names). |
| `src/modules/account/tests/integration/self-service.test.ts` | Integration tests exercising these flows end-to-end. |
| `src/modules/account/services/index.ts` | Barrel that re-exports this module's public functions. |

## Notes

- **Wrapper pattern, not inline emits.** `passwordResetChange`, `removeOwnAccount`, and `updateProfile` wrap shared `userService` methods rather than embedding audit/analytics inside them. This prevents double-firing (e.g., `passwordChange` is also the last step of `passwordChangeWithCurrent`) and prevents misattribution (e.g., an admin's `DELETE /users/:id` would incorrectly report the deleted user as the actor).
- **Locale resolution order** for outbound mail: `user.locale → context.locale → getDefaultLocale()`. The request's `Accept-Language` is deliberately only the *fallback* because reset/delete links are typically clicked from an email client on an arbitrary device.
- **Fire-and-forget email.** `void enqueueEmail(…)` — a transient queue failure must not convert a successful password reset or account deletion into an HTTP error.
- **Read-before-write in `removeOwnAccount`.** The account's email, username, and locale are destructured *before* `userService.remove` so the goodbye mail can be composed after the document is gone.
- **Email change un-verifies.** `updateProfile` sets `user.verified = false` when the email field differs from the stored value; the controller (not this function) sends the new verification email.
- **`zodProfileSchema` is intentionally narrower** than the admin `userService.update`: no `admin`, `active`, or `password` fields are writable here.
