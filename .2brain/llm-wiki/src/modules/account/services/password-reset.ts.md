---
source: src/modules/account/services/password-reset.ts
source_sha256: ee79244c226f609e55f2481a97806ccc0838d8ed594828aab83ec0d82f8c98fe
context_sha256: 8eabb8304e4442e4a0e91d55a48738af154fe0a10437c465aa31aa61344369f4
generated_at: 2026-11-22T03:39:20.296740+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/password-reset.ts

## Purpose
Completes a password reset from the mailed link. It finds the live reset token, validates the new password, then spends the token and writes the password in one transaction, and finally notifies the account owner. Requesting the link lives in `./password-reset-request`.

## Key elements
- `completePasswordReset(token, password, passwordConfirm, context, termsAccepted?)` — the only export, backing `POST /account/password/reset/confirm`. It runs these steps in order:
  1. Validate the password pair with `validatePasswordChange`. A bad pair returns a 422.
  2. `findLiveToken` looks the token up. This is a read only.
  3. `resetWith` does the rest.
  4. Database errors are mapped through `rejectDatabaseEnvelope('auth', …)`.
- `resetWith` (internal) — runs once the link is found:
  - It requires `termsAccepted === true` when the account has no `termsAcceptedAt`, and answers a 422 field error on `termsAccepted` otherwise.
  - It runs the breached-password check (`assertPasswordNotBreached`).
  - It calls `spendThen(PASSWORD_RESET_TOKEN_TYPE, token, passwordWrite(...))`, which spends the token and writes the password in one transaction.
  - If the spend finds no token (the link was used concurrently), it returns the refused-link response.
  - On success it runs `afterPasswordWrite`, then `afterReset`.
- `markResetCompleted` (internal) — the mutation applied during the password write:
  - It zeroes `mfaFailures` and clears `mfaLockedUntil`.
  - It calls `markVerified`, since the mailbox is proven.
  - If the account has no Terms record, it assigns `termsAcceptance()`.
- `afterReset` (internal) — runs only on success. It does two fire-and-forget things:
  - It records the `AUTH_PASSWORD_RESET_COMPLETED` audit row. A failure to audit is logged as a warning and does not fail the reset.
  - It sends the `resetConfirmEmail` through `sendAccountMail`. The mail uses the recipient's own locale first, with the request's locale as the fallback. It lists the user's OAuth providers.
- `resetLinkRefused` (internal) — the 422 for a dead link, via `refuseLink(context, 'password_reset', 'account.reset.token-not-found')`.

## Relationships
- `./tokens`: provides `findLiveToken`, `spendThen` and `refuseLink`.
- `./password`: provides `validatePasswordChange`, `passwordWrite` and `afterPasswordWrite`.
- `./verification`: `markVerified`.
- `./mail` and `../emails`: `sendAccountMail`, `resetConfirmEmail`, `greetableName` and `recipientLocale`.
- `./caller` and `../audit`: `recordAccountAudit` and `accountAuditActions`.
- `../consent-record`: `termsAcceptance`.
- `@infrastructure/security/breached-passwords`: `assertPasswordNotBreached`.
- `@infrastructure/http/response` and `@infrastructure/http/errors`: `generateReject`, `fieldError`, the response types, and `rejectDatabaseEnvelope`.
- `@infrastructure/i18n`: `t` for the terms-not-accepted message.
- `@infrastructure/adapters/logger`: the audit-failure warning.
- `../token-types`: `PASSWORD_RESET_TOKEN_TYPE`.

## Notes
- Ordering matters. Everything before the token spend is a read, and the spend comes last. A refused password (mismatch, breach, missing Terms tick) therefore never burns the link. The atomic spend also settles two simultaneous uses of one link.
- A failing password write rolls back the spend, so the link stays live for a retry.
- Unknown, expired and already-used links all return the same 422 on purpose.
- The Terms refusal happens only after the link is found, so only the holder of a live token ever sees it.
- The audit row and confirmation mail are fire-and-forget. The password has already changed by then, so neither can turn a successful reset into an error.
- Completing a reset clears the 2FA lock deliberately, because anyone who can read the mailbox already has the account's recovery path.
- The `account.sessions_revoked` event is emitted with the password write, not in this file.
- The same find/spend split is used by `two-factor-challenge.ts`.
