---
source: src/modules/account/services/two-factor-outcomes.ts
sha256: 6198a41e298401e11b3757b2ef653b4b9f49c5a7f7bf79367a0d2d53d147ec73
generated_at: 2026-11-08T04:25:07.548785+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-outcomes.ts

## Purpose

Centralised "result" helpers for the two-factor subsystem: building rejection responses, emitting fire-and-forget out-of-band emails, recording audit entries, and exposing a method's public summary. It has no flow of its own—every 2FA endpoint (login challenge, enrollment, reauth) calls into these to keep refusal semantics, notification copy, and audit shape consistent.

## Key elements

- **`notifyChange(user, change, method, context)`** – Fire-and-forget email announcing a factor add/replace/removal. Swallows queue failures to a `logger.warn`.
- **`audited(outcome, context, action, method)`** – Wraps a `Promise<ResponseSuccess | ResponseReject>`; records an `recordAudit` entry (success/failure + method) then re-returns the result untouched.
- **`rejectWrongCode(user)`** – Persists the account *only* if `isModified()` (a wrong code may have burned a delivered-code attempt). A lost race on a deleted account is logged, not thrown. Returns 422 with the "wrong code" i18n string.
- **`rejectLocked()`** – Synchronous 429 with `RATE_LIMITED` error code and the "locked" i18n string; no audit or mail here (see `notifyLocked`).
- **`notifyLocked(user, context)`** – Fire-and-forget email telling the holder 2FA checks are locked, including the lock duration in minutes.
- **`summarize(handler, user)`** – Builds a `TwoFactorMethodSummary` (name, `delivers`, `target`, `resendAfter`). Deliberately omits `enrolledAt`—that field is reserved for the authenticated-owner view.
- **`tooSoon(seconds)`** – Binds the module-private `RESEND_TOO_SOON_CODE` and i18n copy to the shared `resendTooSoon` builder, producing a 429 the client can render as a countdown.
- **`armedEntries(user)`** – `orderedEntries` filtered to entries with `enrolledAt` set; the canonical "what is armed" list.
- **`deliverArmedCode(user, method, context)`** – Resolves the armed handler by name, enforces the per-method delivery cooldown, calls `handler.send`, persists the resulting state, and returns the delivery. Unarmed/unknown methods get an identical 422 so a wrong guess leaks nothing.

## Relationships

- **`@infrastructure/http/response`** (`generateReject`, `generateSuccess`) – every rejection/success this file emits is built through these factories.
- **`@infrastructure/observability/audit`** (`recordAudit`) – the `audited` helper delegates all audit writing here.
- **`@infrastructure/persistence/versioning`** (`isLostRace`) – `rejectWrongCode` catches and downgrades this specific error to a warning.
- **`@infrastructure/i18n`** (`t`) – all user-facing copy is resolved through the i18n function.
- **`@infrastructure/adapters/logger`** – warns on swallowed mail-queue failures and lost-race persistence errors.
- **`@domain-primitives/time`** (`MINUTE_MS`) – converts `MFA_LOCK_MS` to the minute count used in the lock email.
- **`src/modules/account/emails.ts`** – supplies the email body builders (`twoFactorChangedEmail`, `twoFactorLockedEmail`), `recipientLocale`, and `greetableName`.
- **`src/modules/account/services/mail.ts`** (`sendAccountMail`) – the sole mail-transport call site; both notify helpers delegate through it.
- **`src/modules/account/cooldown.ts`** (`resendTooSoon`) – `tooSoon` is a thin binding of this shared builder to the 2FA-specific error code and copy.
- **`../two-factor` barrel** – imports `DELIVERED_CODE_RESEND_SECONDS`, `MFA_LOCK_MS`, `deliveryCooldownRemaining`, `orderedEntries`, and the `TwoFactorMethodHandler` type used by `summarize` and `deliverArmedCode`.

## Notes

- **Fire-and-forget contract.** `notifyChange` and `notifyLocked` are `void`-returning on purpose: the state change has already committed, and a transient mail-queue outage must not surface as an HTTP error.
- **Conditional persist in `rejectWrongCode`.** The `user.isModified()` guard is load-bearing—only a wrong code that *consumed* a delivered-code attempt modifies the document. A plain TOTP miss must not trigger a write, so bursts of wrong TOTP guesses can't generate write collisions.
- **`summarize` vs. authenticated status.** This function is the login-step view (password-proven, nothing more); it intentionally withholds `enrolledAt`. The full `twoFactorStatus` endpoint adds that field for the account owner.
- **`deliverArmedCode` is the single delivery choke-point.** Both the login challenge and the signed-in "resend code" endpoint funnel through it, so cooldown and 422 shape can't drift between the two surfaces. The cooldown check lives here (not only in a route-level rate limiter) because the endpoint sends real mail on the caller's word.
- **`RESEND_TOO_SOON_CODE` is module-private by design.** Clients read the code off the JSON response body; no other module imports this constant.
