# src/modules/account/services/profile.ts

## Purpose

Self-service account maintenance: profile field updates and password changes for an already-authenticated user. Split from `./authentication` along the proving-vs-maintaining line — authentication answers "who is this?", this file answers "change something about my account." Password lives here because every flow that writes one is a modification to an existing record, not a way into the system.

## Key elements

- **`validatePasswordChange`** — Pure validation of a new-password pair (length, confirm-match) via a Zod superRefine; returns i18n error items or an empty array. Extracted so `reset-confirm` can validate *before* spending a one-time token.
- **`passwordChange`** — Validates the pair, sets `user.password`, saves via `userRepository.save`. Returns a standard success/reject envelope.
- **`getOwnProfile`** — Wraps `userService.getById` to emit the `USER_PROFILE_VIEWED` analytics event. Kept separate so admin lookups (which share `getById`) don't miscount as self-views.
- **`passwordResetChange`** — Calls `passwordChange`, then on success emits an audit event and fires a reset-confirmation email (locale resolved from the user, not the request).
- **`removeOwnAccount`** — Captures email/username/locale *before* calling `userService.remove(user, true)` (hard delete), then emits audit + analytics and sends a goodbye email.
- **`zodProfileSchema`** *(internal)* — Partial schema for `PUT /account`: picks `email`/`username` from `zodUserSchema`, extends with `locale`, `imageUrl`, `phone`, `website`, `thumbnailUrl`, `pendingImageKey`.
- **`updateProfile`** — Validates body against `zodProfileSchema`, loads the user with credentials, un-verifies the account if email changed, delegates to `userService.update`, emits `AUTH_PROFILE_UPDATED` audit on success.
- **`passwordChangeWithCurrent`** — Validates the new pair *first* (cheap), then bcrypt-compares the current password, then delegates to `passwordChange`. Wrong current password → 422, not 401.

## Relationships

- **`@modules/users`** — Primary data layer: `zodUserSchema` (validation base), `userRepository` (save, findByIdWithCredentials), `userService` (getById, update, remove), `UserDocument` type.
- **`../emails`** — `resetConfirmEmail` / `deleteConfirmEmail` build the locale-aware email payload; this file handles the `enqueueEmail` call.
- **`../analytics` / `../audit`** — Provide the event/action constant maps (`accountAnalyticsEvents`, `accountAuditActions`) used in every post-mutation emit.
- **`@infrastructure/observability/analytics` & `audit`** — `emitAnalyticsEvent`, `buildAnalyticsBase`, `emitAuditEvent`, `buildAuditEvent` (the actual sinks).
- **`@infrastructure/http/response`** — Envelope constructors (`generateSuccess`, `generateReject`, `validationErrors`).
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` for Mongoose/CastError → HTTP mapping.
- **`@infrastructure/http/request`** — `CallerContext` type threaded through every mutation for audit/analytics attribution.
- **`@infrastructure/i18n`** — `t()` for user-facing messages, `getDefaultLocale()` as last-resort locale fallback.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` (fire-and-forget queue publish).

## Notes

- **Locale resolution for outbound mail** is always `user.locale → context.locale → getDefaultLocale()`. The request's `Accept-Language` is only a fallback because reset/delete links are typically clicked from a shared or borrowed device where that header is meaningless.
- **`removeOwnAccount` snapshots fields before the write.** The delete is hard; after `remove` resolves the document no longer exists, so email/username/locale must be captured from the in-memory copy.
- **`updateProfile` un-verifies on email change** (`user.verified = false`). The caller must re-verify; this prevents carrying a verified mailbox onto a new address.
- **422, not 401, for a wrong current password** in `passwordChangeWithCurrent`. A 401 would be intercepted by client session-expired handlers and log out a valid session.
- **Email sends are `void enqueueEmail(...)`** — intentionally fire-and-forget. A transient queue outage must not turn a successful reset or delete into an error response.
- **`thumbnailUrl` / `pendingImageKey`** appear in `zodProfileSchema` but not in the public `UpdateAccountBody` contract; they are server-side artifacts from image-upload handling passed through by the controller.
- **Duplicate email** on `updateProfile` surfaces as Mongoose E11000 → mapped to 409 by `rejectDatabaseEnvelope`, consistent with signup.
