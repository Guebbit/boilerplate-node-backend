---
source: src/modules/account/services/password-reset.ts
sha256: b70c58c33c4c2471aaeb2ddba27cf3c0e0880aa2c3bbc4d139230a8eb27f95d2
generated_at: 2026-11-14T18:47:33.246963+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password-reset.ts

## Purpose

Implements the completion step of a password reset (the handler behind `POST /account/password/reset/confirm`). Given a token from a mailed link, it validates the new password, confirms the link is live, rejects breached passwords, then atomically spends the token and writes the new password in a single transaction. On success it marks the account verified, clears 2FA state, stamps terms acceptance if missing, records an audit row, and sends a confirmation email.

## Key elements

- **`completePasswordReset`** *(exported)* — Entry point. Validates the password pair, looks up the live token, delegates to `resetWith` on success, or returns a uniform 422 (`resetLinkRefused`) for unknown/expired/spent tokens. Catches database errors via `rejectDatabaseEnvelope`.
- **`resetWith`** — Post-token-found flow. Enforces the terms-acceptance tick (only when the account has no record), runs the breached-password check, then calls `spendThen` to atomically delete the token and write the new password. If the token spend fails, the link is returned unspent.
- **`markResetCompleted`** — Write-callback passed into `passwordWrite`. Resets `mfaFailures`/`mfaLockedUntil`, calls `markVerified`, and stamps `termsAcceptance()` if the account has no existing record.
- **`afterReset`** — Post-success side effects. Fire-and-forget audit row (`recordAccountAudit`) and confirmation email (`sendAccountMail`). Both are `void`-ed; their failures log a warning but never fail the reset.
- **`resetLinkRefused`** — Builds the 422 `ResponseReject` via `refuseLink`, using the i18n key `account.reset.token-not-found`. Deliberately indistinguishable from unknown vs. expired vs. already-used.

## Relationships

- **`src/modules/account/services/tokens.ts`** — `findLiveToken` locates the holder; `spendThen` performs the atomic token-delete + password-write transaction; `refuseLink` shapes the 422 for dead links.
- **`src/modules/account/services/password.ts`** — `validatePasswordChange` checks the pair before any token lookup; `passwordWrite` executes the password set inside the `spendThen` transaction; `afterPasswordWrite` handles post-write session revocation.
- **`src/modules/account/services/verification.ts`** — `markVerified` stamps the address as verified (the reset link serves as proof of mailbox ownership).
- **`src/modules/account/services/mail.ts`** — `sendAccountMail` enqueues the confirmation email at normal priority.
- **`src/modules/account/services/caller.ts`** — `recordAccountAudit` writes the audit row (fire-and-forget).
- **`src/modules/account/audit.ts`** — `accountAuditActions.AUTH_PASSWORD_RESET_COMPLETED` action constant.
- **`src/modules/account/consent-record.ts`** — `termsAcceptance()` generates the default Terms record for staff-created accounts that lack one.
- **`src/modules/account/emails.ts`** — `resetConfirmEmail`, `greetableName`, `recipientLocale` build the confirmation message.
- **`src/infrastructure/security/breached-passwords/index.ts`** — `assertPasswordNotBreached` rejects passwords found in breach datasets.
- **`src/infrastructure/http/response.ts`** — `generateReject`, `fieldError`, and the `ResponseSuccess`/`ResponseReject` union types.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` converts unexpected DB errors into a safe envelope.
- **`src/infrastructure/i18n/index.ts`** — `t()` for the terms-acceptance error message.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` on swallowed audit-lookup failures.

## Notes

- **Spend is always last.** Every rejection path (bad pair, missing terms tick, breached password, dead link) returns *before* the token is consumed, so a user can retry. The `spendThen` call is the only point of no return.
- **Audit and email are fire-and-forget.** Both are `void`-ed with `.catch` (audit) or an intrinsic "never rejects" guarantee (mail). A queue outage or DB hiccup after the password write must not surface as a failed reset.
- **Locale for the confirmation email** uses `recipientLocale(user.locale, context)` — the user's stored locale is primary; the request's `Accept-Language` is only a fallback, since the link is often clicked on a shared device.
- **`oauthAccounts` is `select: false`** in the schema but is still read (with `?? []`) to enumerate providers in the email copy. The eslint-disable comment flags that the TypeScript types are misleading here.
- **Terms acceptance is conditional.** The `termsAccepted !== true` guard only fires when `user.termsAcceptedAt` is absent (e.g., a staff-created account). Normal users who already accepted skip this check entirely.
- **Uniform 422 for dead links.** Unknown, expired, and already-spent tokens all produce the identical response to prevent token enumeration.
