# src/modules/account/services/profile.ts

## Purpose

Implements the "maintain my account" side of the account module: reading one's own profile, updating profile fields (email, username, locale, image), changing password (both from a reset link and with current-password proof), and hard-deleting one's own account. Split from `./authentication` along the proving-vs-maintaining boundary — authentication answers "who is this", this file answers "change something about the account I'm already authenticated as."

## Key elements

- **`validatePasswordChange`** — Pure validation of a new/confirm password pair using a subset of `zodUserSchema`. Returns i18n-annotated `ResponseErrorItem[]`; empty array means the pair is acceptable. Extracted so `reset-confirm` can validate *before* spending the one-time reset token.
- **`passwordChange`** — The shared funnel for all password writes. Validates, saves the document, then revokes all `REFRESH` tokens. Revoke failure is intentionally swallowed (defense-in-depth loss, not a user-facing error). Returns `ResponseSuccess<UserDocument>` or `ResponseReject`.
- **`getOwnProfile`** — Reads the caller's own profile via `userService.getById`, emitting a `USER_PROFILE_VIEWED` analytics event. Wrapped here (rather than inside `getById`) to avoid miscounting admin lookups.
- **`passwordResetChange`** — Calls `passwordChange`, then on success emits an `AUTH_PASSWORD_RESET_COMPLETED` audit event and queues a confirmation email (fire-and-forget). Locale resolution: user's own locale → request locale → default.
- **`removeOwnAccount`** — Hard-deletes the account via `userService.remove(user, true)`, then emits audit + analytics events and queues a goodbye email. All recipient fields are captured *before* the delete since the document no longer exists after.
- **`zodProfileSchema`** (internal) — Partial schema for `PUT /account`: `email`, `username` from `zodUserSchema`; `locale`, `imageUrl`, `phone`, `website`, `analyticsConsent` from `UpdateAccountBody`; plus `thumbnailUrl`/`pendingImageKey` carried from the controller's upload path. All fields optional; absence means "leave it alone."
- **`updateProfile`** — Validates body against `zodProfileSchema`, loads the user with credentials (via `findByIdWithCredentials`), un-verifies the account if the email changed, then delegates to `userService.update`. Duplicate email surfaces as E11000 → 409.

## Relationships

- **`@modules/users`** — Primary data layer: `userRepository` (save, findByIdWithCredentials), `userService` (getById, update, remove), `zodUserSchema` (field constraints + i18n thunks), `TokenType.REFRESH` (token revocation), `UserDocument` type.
- **`@infrastructure/http/response`** — All return-value construction (`generateSuccess`, `generateReject`) and `validationErrors` for mapping Zod issues to API error items.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` converts Mongoose/DB exceptions into the standard error envelope.
- **`@infrastructure/http/request`** — `CallerContext` type carries the authenticated caller's identity and locale into service functions.
- **`@infrastructure/i18n`** — `t()` resolves user-facing error/confirmation messages; `getDefaultLocale()` is the final fallback in locale resolution chains.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` publishes confirmation emails (reset-confirmed, account-deleted) to the queue.
- **`../emails`** — `resetConfirmEmail` / `deleteConfirmEmail` build the locale-appropriate subject, template, and data for those emails.
- **`../analytics`** / **`../audit`** — `accountAnalyticsEvents` and `accountAuditActions` provide the canonical event/action identifiers emitted by this file.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` for product analytics.
- **`@infrastructure/observability/audit`** — `emitAuditEvent` + `buildAuditEvent` for the compliance audit log.
- **`../services/index`** — This file is one of several services in the folder; the barrel re-exports them.
- **`tests/integration/self-service.test.ts`** — Integration tests exercising the self-service flows defined here.

## Notes

- **Revoke order is deliberate.** `passwordChange` saves the password *then* revokes tokens. A failed save must not log the user out; a failed revoke after a successful save is accepted as a tolerable defense-in-depth gap.
- **Email locale resolution** (`passwordResetChange`, `removeOwnAccount`): the *user's stored* locale takes priority, the *request's* locale is only a fallback (the link may be opened on a borrowed/shared device), and `getDefaultLocale()` is the last resort. The worker that sends the mail needs no locale — it is baked in at enqueue time.
- **Emails are fire-and-forget.** `void enqueueEmail(...)` — a transient queue outage must not turn a successful reset or deletion into an HTTP error.
- **Email change un-verifies.** If `updateProfile` receives a new email different from the current one, `user.verified` is set to `false` before the write, preventing a verified mailbox from laundering a new address.
- **`getOwnProfile` is a thin wrapper** specifically so the analytics event is scoped to self-service. Adding it inside `userService.getById` would inflate the count with admin lookups.
- **`thumbnailUrl` / `pendingImageKey`** appear in `zodProfileSchema` but *not* in the `UpdateAccountBody` contract — the controller injects them from its own `readUploadedImage` call. They are server-produced, not client-supplied.
- **Missing user on `updateProfile`** returns 401 (not 404), matching the `openapi.yaml` contract and the `isAuth` middleware's treatment of "valid token, user gone."
