---
source: src/modules/account/services/password-reset.ts
sha256: 3e41be065a4b4ea1d908ca1881197bf081fa1c73886e1966c7a8edf90d1b3f64
generated_at: 2026-10-14T08:50:37.406689+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password-reset.ts

## Purpose

Handles the confirmation side of a password reset: the user clicks the mailed link, supplies a new password, and the system validates, spends the one-time token, writes the new password, marks the email address verified, records an audit row, and sends a confirmation mail. The request side lives in `./password-reset-request`.

## Key elements

- **`completePasswordReset`** (exported) — `POST /account/reset-confirm` entry point. Validates password shape/match, finds the live token, then delegates to `resetWith`. Returns a shared 422 for unknown, expired, or already-spent links (indistinguishable on purpose).
- **`passwordResetChange`** (exported) — Alternative path that already has the user document; wraps `passwordChange` with `markResetCompleted` as the `beforeSave` hook, then calls `afterReset`.
- **`afterReset`** (internal) — Post-success shared tail: fire-and-forget audit row (with role lookup via `isUnrestrictedCaller`) and fire-and-forget confirmation mail via `sendAccountMail`.
- **`resetWith`** (internal) — Breach check → atomic token spend → `writePassword`. Spend is last so a refused password never burns the link.
- **`resetLinkRefused`** (internal) — Records a one-time-token rejection and returns a 422 with the i18n "token not found" message.
- **`markResetCompleted`** (internal) — Clears `mfaFailures`/`mfaLockedUntil` and calls `markVerified`. Injected as the `beforeSave` callback so verification and password land in one write.

## Relationships

- **`./password`** — Imports `validatePasswordChange`, `passwordChange`, `writePassword`. `passwordResetChange` delegates to `passwordChange`; `resetWith` calls `writePassword` directly after the spend.
- **`./tokens`** — `findLiveToken` resolves the token to a user; `spendLiveToken` is the atomic delete that settles races; `recordOneTimeTokenRejected` logs the audit trail for a dead link.
- **`./verification`** — `markVerified` is called (via `markResetCompleted`) so a successful reset also verifies the mailbox, since the token was delivered to that inbox.
- **`./mail`** — `sendAccountMail` publishes the confirmation email job.
- **`../emails`** — `resetConfirmEmail`, `greetableName`, `recipientLocale` build the mail content and resolve the recipient's language.
- **`@infrastructure/security/breached-passwords`** — `assertPasswordNotBreached` gates the write.
- **`@infrastructure/observability/audit`** + **`../audit`** — `recordAudit` with `accountAuditActions.AUTH_PASSWORD_RESET_COMPLETED`.
- **`../roles`** — `isUnrestrictedCaller` determines the actor role for the audit row.
- **`@infrastructure/http/response`** — `generateReject` and the `ResponseSuccess`/`ResponseReject` envelope types.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` wraps unexpected DB errors.
- **`@infrastructure/i18n`** — `t()` for user-facing error strings.
- **`@infrastructure/adapters/logger`** — Warn-level log when the audit role lookup fails.
- **`../token-types`** — `PASSWORD_RESET_TOKEN_TYPE` constant for token lookups.

## Notes

- **Spend order is a deliberate invariant.** Everything before `spendLiveToken` is a read (shape check, token find, breach check). The atomic spend is last so a refused password never consumes the link.
- **Verification is conditional on a successful write.** `markVerified` rides in as the `beforeSave` hook, which runs after the final password-validation refusal. A too-weak or breached password cannot verify the address "on its way out."
- **`passwordChangeWithCurrent` does NOT get verification.** An already-authenticated caller typing their current password proves nothing about mailbox possession; only the reset path (where the token was mailed to that inbox) earns it.
- **Fire-and-forget audit and mail.** Both the audit role lookup and the mail publish are `void`-ed promises. A queue or lookup hiccup after a successful password change must not turn the response into an error.
- **Locale resolution.** The confirmation mail uses `recipientLocale(user.locale, context)` — the user's stored preference first, the request's `Accept-Language` only as fallback — because the link is often clicked from a shared or borrowed device.
- **`oauthAccounts` type lie.** The schema types mark it as always loaded, but it is `select: false`. The code uses `?? []` with an eslint-disable to work around the false type assertion.
