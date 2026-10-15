---
source: src/modules/account/services/two-factor-outcomes.ts
sha256: 99d15eea4e8aa9afd134bad2369810c5ed00584f59ff6c3bd728fc815cb17806
generated_at: 2026-10-15T10:04:45.788453+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-outcomes.ts

## Purpose

Shared "outcomes" layer for every two-factor flow: it standardizes the HTTP responses a 2FA operation returns (success, wrong-code, locked, cooldown), fires the out-of-band notification emails, builds the per-method public summary, and wraps results in audit records. It exists so that challenge, enrollment, and lockout flows all produce identical response shapes and enforcement without each re-implementing the logic.

## Key elements

- **`notifyChange`** – Fire-and-forget email telling the account holder their 2FA methods changed. Swallows the promise rejection; logs a warning instead of failing the already-committed operation.
- **`audited`** – Wraps a `Promise<ResponseSuccess | ResponseReject>` and records an audit entry (action, outcome, method) before passing the result through unchanged.
- **`rejectWrongCode(user)`** – Returns a 422 rejection. If the user document was mutated (a delivered-code attempt was burned) it persists the write first; a lost-race write is logged, not rethrown.
- **`rejectLocked`** – Returns a 429 rejection for a locked account (no code comparison occurred).
- **`notifyLocked`** – Fire-and-forget email informing the holder that wrong codes triggered a lock; includes the lock duration in minutes.
- **`summarize(handler, user)`** – Builds a `TwoFactorMethodSummary` (name, delivery mode, target, optional `resendAfter`). Deliberately omits `enrolledAt`.
- **`tooSoon(seconds)`** – Binds this module's error code and i18n string onto the shared `resendTooSoon` builder, returning a 429 `ResponseReject`.
- **`armedEntries(user)`** – Returns the account's enrolled factors in registry (handler) order, not enrollment order.
- **`deliverArmedCode(user, method, context)`** – The single "send a code" path shared by both the login challenge and the authenticated resend endpoint. Rejects unarmed/unknown methods with the same 422, enforces per-method cooldown, then calls the handler's `send` and persists the resulting delivery state.

## Relationships

- **`@infrastructure/i18n`** – All user-facing strings go through `t()`; locale comes from `recipientLocale(user.locale, context)` supplied by `../emails`.
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` build every return value; the `ResponseSuccess` / `ResponseReject` types define the function signatures.
- **`@infrastructure/adapters/logger`** – Every fire-and-forget email failure and lost-race persistence is logged via `logger.warn`.
- **`@infrastructure/observability/audit`** – `audited` calls `recordAudit` to write the action trail.
- **`@infrastructure/persistence/versioning`** – `isLostRace` distinguishes a "account deleted between read and write" from a real error in `rejectWrongCode`.
- **`../cooldown`** – `resendTooSoon` is the shared 429 builder; this file supplies the flow-specific code and message.
- **`../emails`** – Provides the two notification email templates (`twoFactorChangedEmail`, `twoFactorLockedEmail`) and helper functions (`recipientLocale`, `greetableName`).
- **`./mail`** – `sendAccountMail` is the transport both notification functions call.
- **`../two-factor`** – Supplies `MFA_LOCK_MS`, `DELIVERED_CODE_RESEND_SECONDS`, `deliveryCooldownRemaining`, `orderedEntries`, and the `TwoFactorMethodHandler` interface that `summarize` and `deliverArmedCode` consume.
- **`two-factor-challenge`, `two-factor-enrollment`, `two-factor-lockout`** (graph neighbors) – These flow files import the outcome helpers from this module rather than building responses inline.

## Notes

- **Conditional persist in `rejectWrongCode`:** The write fires only when `user.isModified()` is true. A burst of wrong TOTP codes (no state change) never writes, so they cannot collide with each other or with the single correct code. The per-account attempt reservation—not this write—is the real brute-force bound.
- **`summarize` omits `enrolledAt`:** A caller who has only proved a password must not learn when a factor was armed; the authenticated owner gets that field via a separate `twoFactorStatus` path.
- **Enumeration defence in `deliverArmedCode`:** Unarmed and unknown methods return the identical 422 message, preventing a challenge-holder from probing which factors an account has enrolled.
- **`RESEND_TOO_SOON_CODE` is module-private:** Clients identify the cooldown response by reading the code off the HTTP response, not by importing the constant.
- **Emails are always fire-and-forget:** Both `notifyChange` and `notifyLocked` use `void … .catch(…)` so a transient mail-queue outage never turns a completed state change into a visible error.
