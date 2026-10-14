---
source: src/modules/account/services/profile.ts
sha256: 815a58fbb7b55a5a686c6c120d8fc9673eb63fba66483d1401656e47c1ced93b
generated_at: 2026-10-14T08:51:49.414738+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/profile.ts

## Purpose

Service layer for the `PUT`/`PATCH /account` endpoint: reads and updates the caller's own editable profile (username, locale, phone, website, analytics consent, image). Email changes are delegated to `./email-change`; password changes belong to `./password`.

## Key elements

- **`getOwnProfile(userId, context)`** — Loads the caller's own profile via `userService.findByIdWithPendingEmail` and emits a `USER_PROFILE_VIEWED` analytics event. Returns `UserDocument | undefined`.
- **`zodProfileSchema`** — Validation schema built from `UpdateAccountBody.pick({…}).extend({…}).partial()`. Adds `analyticsConsent` (via `optionalBooleanSchema`), `imageUrl`, `thumbnailUrl`, and `pendingImageKey` — the latter three being server-produced fields not present on the wire contract.
- **`saveProfile(user, fields, emailOutcome, context)`** — Internal. Checks mailbox budget for the new address (only when a genuine email change is pending), calls `userService.update`, then fires the "email change requested" notification mail.
- **`writeProfile(user, fields, emailOutcome, context)`** — Internal. Gates on the email-change cooldown (`resendCooldownRemaining`), handles 409 conflict, then delegates to `saveProfile`.
- **`updateProfile(userId, data, context)`** — Public entry point. Parses input, loads the user (with credentials), delegates the `email` field to `applyEmailChangeRequest`, runs `writeProfile`, records an audit event on success, and wraps the result with `generateSuccess`/`generateReject`.

## Relationships

- **`./email-change`** — `applyEmailChangeRequest` decides whether the email field is a no-op, a new pending change, or a conflict; `notifyEmailChangeRequested` sends the verification mail. This file never writes `email` or `pendingEmail` directly.
- **`../cooldown`** — `resendTooSoon` builds the 429 response when the per-account email-change cooldown hasn't elapsed.
- **`../mail-budget`** — `mailRecipientRefusal` gates the write if the target mailbox has exceeded its send budget.
- **`../analytics` / `../audit`** — Provides the `accountAnalyticsEvents` and `accountAuditActions` enums consumed by the observability calls.
- **`@infrastructure/http/response`** — `generateSuccess`, `generateReject`, `validationErrors` shape every return value.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` catches database-layer failures into the standard error envelope.
- **`@infrastructure/http/schemas`** — `optionalBooleanSchema` handles multipart string-vs-boolean for `analyticsConsent`.
- **`@infrastructure/i18n`** — `t` supplies user-facing messages (success, too-soon, email-already-used).
- **`@infrastructure/observability/analytics` / `audit`** — `emitAnalyticsEvent` / `buildAnalyticsBase` for the view event; `recordAudit` for the profile-update audit log.
- **`./index.ts`** — Re-exports this module for consumers.

## Notes

- **Email is indirect.** `updateProfile` never writes `email` itself; `applyEmailChangeRequest` routes it through `pendingEmail`, so the `verified` flag (describing the *current* address) is untouched until the change is confirmed.
- **`analyticsConsent` is a string on the wire.** Multipart requests send `"true"`/`"false"`; a plain `z.boolean()` would treat `"false"` as truthy. `optionalBooleanSchema` handles the coercion.
- **`imageUrl` / `thumbnailUrl` / `pendingImageKey` are not client-authored.** They are produced by the controller's `readUploadedImage` call and passed alongside the body; the wire schema only permits `null` for removal.
- **PUT vs. PATCH.** By the time this file runs, the PUT path has already filled omitted fields with `null`, so `.partial()` uniformly means "absence = leave alone."
- **Deleted account → 401, not 404.** A valid token belonging to a since-deleted user yields a 401 (matching `openapi.yaml` and the `isAuth` convention on every other route).
- **Cooldown before budget.** The cooldown check runs before the mailbox budget, so a rate-limited request consumes no budget.
