---
source: src/modules/account/services/profile.ts
sha256: 27b52ccbbfb52bc08b62ad3991d7e46b90cb2897bff1ea4be9bb86e03a36b9a2
generated_at: 2026-10-29T02:43:10.412942+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/profile.ts

## Purpose

Handles the caller's own profile read and update (`PUT`/`PATCH /account`). It orchestrates the full write path—cooldown pacing, mailbox-budget check, the DB save, and post-save notifications—while delegating email-change logic to `./email-change` and password logic to a sibling service.

## Key elements

- **`getOwnProfile(userId, context)`** – Emits a `USER_PROFILE_VIEWED` analytics event, then reads the user via `userService.findByIdWithPendingEmail` so the caller's own client can see a pending email change.
- **`ProfileFields`** (internal type) – The set of writable fields (`email`, `username`, `locale`, `phone`, `website`, `analyticsConsent`) plus server-produced image fields (`imageUrl`, `thumbnailUrl`, `pendingImageKey`). All optional; absence means "leave unchanged."
- **`saveProfile`** (internal) – Checks the recipient mailbox budget (only for a genuine, pending email change), enqueues an outbox event if analytics consent is being withdrawn, performs the DB write via `userService.updateOwnProfile`, then nudges the outbox and fires the email-change notification mail.
- **`writeProfile`** (internal) – Gates the write behind two pre-checks: a 409 conflict (email already in use) and a per-account resend cooldown (1 min). Only then calls `saveProfile`.
- **`updateProfile(userId, changes, context)`** – Public entry point. Loads the caller via `withOwnAccount`, runs `applyEmailChangeRequest`, captures audit metadata (reading fields *before* the write mutates the document), calls `writeProfile`, records an audit entry on success, and shapes the HTTP response.

## Relationships

- **`@infrastructure/http/response`** – Wraps results with `generateSuccess` / `generateReject`.
- **`@infrastructure/http/errors`** – Catches unknown errors at the boundary via `rejectDatabaseEnvelope('auth', error)`.
- **`@infrastructure/i18n`** – Localises all user-facing error messages via `t()`.
- **`@infrastructure/observability/analytics`** – Emits `USER_PROFILE_VIEWED` and builds the analytics base payload.
- **`@infrastructure/observability/audit`** – Records `AUTH_PROFILE_UPDATED` audit entries on successful writes.
- **`src/modules/account/analytics.ts`** – Supplies the `accountAnalyticsEvents` enum.
- **`src/modules/account/audit.ts`** – Supplies the `accountAuditActions` enum.
- **`src/modules/account/cooldown.ts`** – `resendTooSoon` produces the 429 response when the 1-minute email-change cooldown is active.
- **`src/modules/account/mail-budget.ts`** – `mailRecipientRefusal` checks the destination mailbox's incoming budget before saving.
- **`src/modules/account/events.ts`** – `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN` event name for the outbox.
- **`src/kernel/outbox.ts`** – `enqueueOutboxEvent` (consent withdrawal) and `nudgeOutbox` (kick the relay after the transaction).
- **`src/modules/account/services/caller.ts`** – `withOwnAccount` loads the authenticated user and guards against cross-account access.

## Notes

- **`email` is never written directly here.** `applyEmailChangeRequest` (from `./email-change`) is the sole writer of `email`/`pendingEmail`; this file only consumes its `EmailChangeOutcome` verdict. This keeps `verified` (which describes the *current* address) untouched while a change is still unproven.
- **`getOwnProfile` deliberately avoids `userService.getById`.** Two reasons: (1) the admin's `get-user-item` lookup must not see `pendingEmail`, and (2) an unconditional analytics event inside a shared `getById` would miscount admin reads as the user's own profile views.
- **Image fields are server-produced.** The controller calls `readUploadedImage` and passes the resulting paths; a client can never set `imageUrl` from the wire body.
- **Ordering matters:** cooldown is checked *before* the mailbox budget, so a paced request costs nothing. Budget is checked *before* the DB write, so a refused change leaves `pendingEmail` unmodified.
- **Consent withdrawal is transactional.** The outbox row is enqueued inside the same Mongoose session as the profile update; `nudgeOutbox` fires only after a successful commit.
- **Narrower than admin update.** This service exposes no `admin`, `active`, or `password` fields—those belong to `/users` and to `passwordChangeWithCurrent`, respectively.
