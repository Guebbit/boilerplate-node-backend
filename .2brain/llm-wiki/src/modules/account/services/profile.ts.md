---
source: src/modules/account/services/profile.ts
sha256: 1eb2b0e894de53f3dae483028acc8c97a8682a3a46f0eef505a84f69c75fad49
generated_at: 2026-11-08T04:21:12.027808+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/profile.ts

## Purpose

Handles reading and updating the caller's own account profile (`GET`, `PUT`, `PATCH /account`). It orchestrates the full write path—cooldown pacing, mailbox-budget checks, the persisted update, and post-save side-effects (email-change notification, analytics-consent withdrawal)—while deliberately excluding password changes (owned by `./password`) and admin-only fields.

## Key elements

- **`getOwnProfile(userId, context)`** — Reads the caller's profile via `userService.findByIdWithPendingEmail` (exposes the `select: false` `pendingEmail` field) and emits a `USER_PROFILE_VIEWED` analytics event scoped to the caller.
- **`ProfileFields`** (internal type) — The shape of writable profile fields. Image URLs are server-decided (from `readUploadedImage` in the controller), never a client-supplied string.
- **`saveProfile(user, fields, emailOutcome, context)`** (internal) — Checks the recipient's mailbox budget for a genuine email change, detects analytics-consent withdrawal (`true → false`), calls `userService.updateOwnProfile` (passing an optional `announceWithdrawal` callback that enqueues an outbox event in the same session), then fires `notifyEmailChangeRequested` if this call initiated the change.
- **`writeProfile(user, fields, emailOutcome, context)`** (internal) — Guards the save: returns a 409 on email conflict, checks the per-account resend cooldown (`resendCooldownRemaining`) before touching the budget, then delegates to `saveProfile`.
- **`updateProfile(userId, changes, context)`** — Public entry point. Loads the account via `withOwnAccount`, routes `email` through `applyEmailChangeRequest`, builds audit metadata from pre-write state, calls `writeProfile`, records an audit entry on success, wraps DB errors with `rejectDatabaseEnvelope`, and shapes the final `200` response.

## Relationships

- **`@infrastructure/http/response`** — Builds all `ResponseSuccess` / `ResponseReject` payloads (`generateSuccess`, `generateReject`).
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` catches unhandled DB errors in `updateProfile`.
- **`@infrastructure/i18n`** — `t()` for user-facing error messages (email conflict, cooldown).
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` for the `USER_PROFILE_VIEWED` event in `getOwnProfile`.
- **`@infrastructure/observability/audit`** — `recordAudit` logs the successful profile update with change metadata.
- **`@kernel/outbox`** — `enqueueOutboxEvent` (inside the DB session) queues the `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN` event; `nudgeOutbox` triggers dispatch after a successful save.
- **`../mail-budget`** — `mailRecipientRefusal` checks whether the *new* email address's owner has refused incoming mail before any write occurs.
- **`../cooldown`** — `resendTooSoon` formats the 429 response when the per-account resend cooldown is active.
- **`../events`** — Supplies the `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN` event name.
- **`../analytics`** — `accountAnalyticsEvents.USER_PROFILE_VIEWED` constant.
- **`../audit`** — `accountAuditActions.AUTH_PROFILE_UPDATED` constant.
- **`./caller`** — `withOwnAccount` loads the authenticated user's document and guarantees the caller is the owner.

## Notes

- `getOwnProfile` intentionally uses `findByIdWithPendingEmail` rather than the shared `userService.getById`; the latter is used by admin lookups that must not see `pendingEmail`, and an analytics event in `getById` would miscount admin reads as the user's own view.
- `email` never reaches `userService.update` directly. `applyEmailChangeRequest` is the sole writer of `email`/`pendingEmail` on this path, keeping the `verified` flag (which describes the *current* confirmed address) untouched while a change is pending.
- The analytics-consent withdrawal check reads `user.analyticsConsent === true` **before** the write mutates the document; `undefined` (never opted in) and `false` (already withdrew) are both no-ops.
- Cooldown is evaluated *before* the mailbox-budget check, so a paced request consumes no budget.
- Image fields (`imageUrl`, `thumbnailUrl`, `pendingImageKey`) are populated by the controller's own `readUploadedImage` call and passed through the `ProfileFields` object; they are not part of the raw HTTP body contract.
