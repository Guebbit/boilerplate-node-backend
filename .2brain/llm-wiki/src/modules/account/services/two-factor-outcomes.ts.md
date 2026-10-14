---
source: src/modules/account/services/two-factor-outcomes.ts
sha256: 8d2c6cf8b58b3b5bd542f22df84fe3e8e47d4553e306c99cc42efb7b3749f362
generated_at: 2026-10-14T08:56:52.826179+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-outcomes.ts

## Purpose

Shared outcome builders for the two-factor authentication flows. This module centralises the things a 2FA flow says back to the client or to the world: audit recording, structured rejection responses, fire-and-forget out-of-band email notifications, and a method's public summary. It owns no flow itself; the enrollment, challenge, and lockout services import these helpers so their verdicts stay consistent.

## Key elements

- **`notifyChange(user, change, method, context)`** — Fire-and-forget email telling the account holder a second factor was added, replaced, or removed. Catches and logs queue failures rather than surfacing them as errors.
- **`audited(outcome, context, action, method)`** — Wraps a `Promise<ResponseSuccess | ResponseReject>` so that, regardless of success or failure, a method-scoped audit event is recorded before the result is passed through.
- **`rejectWrongCode(user)`** — Builds a 422 rejection for a wrong code. If the user document was mutated (an attempt-budget write), persists it first; a lost optimistic-concurrency race is logged, not thrown.
- **`rejectLocked()`** — Builds a 429 rejection for a locked account (no code comparison needed).
- **`notifyLocked(user, context)`** — Fire-and-forget email informing the account holder that wrong codes have locked their 2FA, including the lock duration in minutes.
- **`summarize(handler, user)`** — Produces a `TwoFactorMethodSummary` (method name, delivery target, resend interval) from a registered handler. Deliberately omits `enrolledAt`.
- **`tooSoon(seconds)`** — Delegates to the shared `resendTooSoon` cooldown builder with the module-specific error code and copy.
- **`MFA_LOCK_MINUTES`** / **`RESEND_TOO_SOON_CODE`** — Module-private constants derived from the two-factor config and the shared error-code registry.

## Relationships

- **`@infrastructure/http/response`** — Imports `generateReject` and the `ResponseSuccess`/`ResponseReject` union types used by every rejection builder.
- **`@infrastructure/i18n`** — Imports `t` for localised user-facing copy in all rejection and email paths.
- **`@infrastructure/observability/audit`** — Imports `recordAudit` and the `AuditAction` type; `audited` is the sole audit call-site in this module.
- **`@infrastructure/persistence/versioning`** — Imports `isLostRace` to distinguish a benign optimistic-concurrency loss from a real error in `rejectWrongCode`.
- **`@infrastructure/adapters/logger`** — Imports `logger` for `warn`-level logging on mail-queue failures and lost races.
- **`@modules/users`** — Imports `userService` (to call `persistTwoFactorMethods`) and the `UserDocument` type.
- **`src/modules/account/emails.ts`** — Imports the two 2FA-specific email builders, `recipientLocale`, `greetableName`, and the `TwoFactorChange` type.
- **`src/modules/account/services/mail.ts`** — Imports `sendAccountMail` used by both `notifyChange` and `notifyLocked`.
- **`src/modules/account/cooldown.ts`** — Imports `resendTooSoon` for the `tooSoon` helper.
- **`src/modules/account/two-factor/index.ts`** — Imports `DELIVERED_CODE_RESEND_SECONDS`, `MFA_LOCK_MS`, and the `TwoFactorMethodHandler` type.
- **`src/modules/account/services/two-factor-challenge.ts`**, **`two-factor-enrollment.ts`**, **`two-factor-lockout.ts`**, **`src/modules/account/two-factor/registry.ts`** — Consumer-side neighbours: these flow services import the exports of this module to build their responses, record audits, and send notifications.

## Notes

- The module is explicitly internal ("no flow of its own"); all exports are helpers, not endpoints.
- `rejectWrongCode` has a subtle persistence step: it writes the user document only when `isModified()` is true, so a burst of wrong TOTP codes (which mutate nothing) never issues a write and cannot collide with each other or with the one correct code.
- `summarize` intentionally excludes `enrolledAt` because it is called at the login step by a caller who has only proved a password; the authenticated-owner view (`twoFactorStatus`) adds that field separately.
- Error codes are module-private: a client reads the code off the JSON response body, not from an exported constant.
- Both notification helpers (`notifyChange`, `notifyLocked`) are fire-and-forget by design; a mail-queue outage must not turn an already-committed state change into a client-visible error.
